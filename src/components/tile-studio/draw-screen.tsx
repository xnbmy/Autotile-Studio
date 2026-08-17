"use client"

import { useState } from "react"
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels"
import { useEditorStore } from "@/lib/store"
import { generateTileAsset } from "@/lib/asset-factory"
import {
  deriveTilesFromBase,
  applyOverrides,
  generateQuadrantStitch,
  DUAL16_SLOT_KEYS,
  BLOB5_SLOT_KEYS,
} from "@/lib/quadrant-stitch"
import { DrawToolbar } from "@/components/tile-studio/draw-toolbar"
import ModeCCanvas from "@/components/tile-studio/mode-c-canvas"
import { ModeCOverview } from "@/components/tile-studio/mode-c-overview"
import ModeCTestMap from "@/components/tile-studio/mode-c-test-map"
import { ExportDialog } from "@/components/tile-studio/export-dialog"
import { SaveDialog } from "@/components/tile-studio/save-dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Save } from "lucide-react"
import type { LibraryAsset, SourceMode } from "@/lib/types"

/**
 * 手绘界面（两条路径的汇合点）：编辑 5 块基础像素，实时派生瓦片并测试/导出。
 * 顶部：绘制工具栏 + 导出；左侧：上为 5 块基础画布、下为 16/47 总览；右侧：手绘地图测试区。
 */
export function DrawScreen() {
  const sourceMode = useEditorStore((s) => s.sourceMode)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const genParams = useEditorStore((s) => s.genParams)
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  const overrides = useEditorStore((s) => s.overrides)
  const hasBase = Object.keys(baseCanvases).length > 0

  const [exportOpen, setExportOpen] = useState(false)
  const [exportTarget, setExportTarget] = useState<LibraryAsset | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveThumbnail, setSaveThumbnail] = useState("")

  // 左右两区（左：基础块/总览 · 右：测试地图）：宽度拖拽记忆
  const { defaultLayout: hLayout, onLayoutChanged: onHLayoutChanged } = useDefaultLayout({ id: "autotile-draw-screen" })
  // 左区上下（基础块 / 总览）：高度拖拽记忆
  const { defaultLayout: hVL2, onLayoutChanged: onSVLayoutChanged } = useDefaultLayout({ id: "autotile-draw-left" })

  async function handleExportClick() {
    // 进入手绘界面后，导出以「当前基础块」为准：固化/手绘/参数生成得到的 baseCanvases
    // 直接派生导出，保证与左下角总览一致，也避免重开项目时依赖可能未恢复的切片原图/槽位。
    if (hasBase) {
      // 参数 / 手绘 / 固化：从 baseCanvases 实时派生（含单格微调）
      const tiles = applyOverrides(deriveTilesFromBase(baseCanvases, mappingType, tileSize), overrides)
      if (tiles.size === 0) {
        toast.error("尚无基础像素，请在中间画布绘制")
        return
      }
      const firstTile = tiles.get(15) ?? tiles.values().next().value!
      const thumb = firstTile.toDataURL("image/png")
      const asset: LibraryAsset = {
        id: `work-${Date.now()}`,
        name: "当前图块",
        kind: "autotile",
        mappingType,
        // 47 模式瓦片尺寸由素材实际尺寸决定（参数=tileSize / 固化=gridSize），导出按实际尺寸排版
        tileSize: firstTile.width || tileSize,
        params: { ...genParams },
        tiles,
        thumbnail: thumb,
        createdAt: Date.now(),
      }
      setExportTarget(asset)
    } else if (sourceMode === "slice") {
      // 切图路径但尚无固化基础块：从绑定槽位直接拼合导出（47 恒定 5 槽）
      const s = useEditorStore.getState()
      const slotKeys = s.mappingType === "16" ? DUAL16_SLOT_KEYS : BLOB5_SLOT_KEYS
      if (!s.modeBImage) {
        toast.error("请先导入图片并绑定槽位")
        return
      }
      const missing = slotKeys.filter((k) => !s.modeBSlots[k])
      if (missing.length > 0) {
        toast.error("尚有槽位未绑定", { description: `缺少 ${missing.length} 个槽位` })
        return
      }
      try {
        const result = await generateQuadrantStitch(
          s.modeBImage,
          s.modeBGridSize,
          s.modeBSlots,
          s.mappingType,
          s.tileSize,
        )
        const first = result.tiles.values().next().value!
        setExportTarget({
          id: `slice-${Date.now()}`,
          name: "切片模板",
          kind: "autotile",
          mappingType: result.mappingType,
          tileSize: result.tileSize,
          params: { ...s.genParams },
          tiles: result.tiles,
          thumbnail: first.toDataURL("image/png"),
          createdAt: Date.now(),
        })
      } catch (err) {
        toast.error("拼合失败", { description: err instanceof Error ? err.message : "未知错误" })
        return
      }
    } else {
      setExportTarget(generateTileAsset("程序生成纹理", mappingType, tileSize, genParams))
    }
    setExportOpen(true)
  }

  function handleSaveClick() {
    if (!hasBase) {
      toast.error("尚无基础像素可保存")
      return
    }
    // 派生一张瓦片作为列表缩略图
    try {
      const tiles = applyOverrides(deriveTilesFromBase(baseCanvases, mappingType, tileSize), overrides)
      const first = tiles.values().next().value
      setSaveThumbnail(first?.toDataURL("image/png") ?? "")
    } catch {
      setSaveThumbnail("")
    }
    setSaveOpen(true)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* 顶部：绘制工具栏 + 保存 / 导出 */}
      <div className="flex shrink-0 items-center justify-between border-b bg-sidebar px-3 py-1.5">
        <DrawToolbar />
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={handleSaveClick} className="gap-1.5">
            <Save data-icon="inline-start" />
            保存
          </Button>
          <Button size="sm" onClick={handleExportClick} className="bg-amber-500 text-amber-950 hover:bg-amber-400">
            导出
          </Button>
        </div>
      </div>

      {/* 左右两栏：左（基础块/总览）｜右（测试地图） */}
      <Group
        orientation="horizontal"
        id="draw-screen"
        className="min-h-0 flex-1"
        defaultLayout={hLayout}
        onLayoutChanged={onHLayoutChanged}
      >
        {/* 左栏：上为 5 块基础画布、下为 16/47 总览 */}
        <Panel id="left" defaultSize={hLayout ? `${hLayout[0]}%` : "62%"} minSize="30%" className="h-full min-h-0">
          <Group
            orientation="vertical"
            id="draw-left"
            className="h-full min-h-0"
            defaultLayout={hVL2}
            onLayoutChanged={onSVLayoutChanged}
          >
            <Panel id="canvas" defaultSize="55%" minSize="20%" className="h-full min-h-0">
              <main className="flex h-full min-w-0 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <ModeCCanvas />
                </div>
              </main>
            </Panel>
            <Separator className="h-1.5 w-full shrink-0 bg-border/50" />
            <Panel id="overview" defaultSize="45%" minSize="15%" className="h-full min-h-0">
              <div className="h-full min-h-0 overflow-hidden">
                <ModeCOverview />
              </div>
            </Panel>
          </Group>
        </Panel>

        <Separator className="w-1.5 h-full shrink-0 bg-border/50" />

        {/* 右栏：手绘地图测试区 */}
        <Panel id="testmap" defaultSize={hLayout ? `${hLayout[1]}%` : "38%"} minSize="20%" className="h-full min-h-0">
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              <ModeCTestMap />
            </div>
          </div>
        </Panel>
      </Group>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} asset={exportTarget} />
      <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} thumbnail={saveThumbnail} />
    </div>
  )
}