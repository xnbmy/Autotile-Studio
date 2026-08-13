"use client"

import { useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { generateTileAsset } from "@/lib/asset-factory"
import { deriveTilesFromBase } from "@/lib/quadrant-stitch"
import { TopBar } from "@/components/tile-studio/top-bar"
import { ModeAPanel } from "@/components/tile-studio/mode-a-panel"
import { ModeACanvas } from "@/components/tile-studio/mode-a-canvas"
import { ModeBPanel } from "@/components/tile-studio/mode-b-panel"
import { ModeBGridView } from "@/components/tile-studio/mode-b-grid-view"
import { ModeBTemplateView } from "@/components/tile-studio/mode-b-template-view"
import { ModeBTestMap } from "@/components/tile-studio/mode-b-test-map"
import ModeCCanvas from "@/components/tile-studio/mode-c-canvas"
import { ModeCOverview } from "@/components/tile-studio/mode-c-overview"
import ModeCTestMap from "@/components/tile-studio/mode-c-test-map"
import { ExportDialog } from "@/components/tile-studio/export-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LibraryAsset, TileAsset } from "@/lib/types"
import { toast } from "sonner"

// 中间工作区两视图：A=基础5块编辑 / B=16·47总览
type WorkbenchTab = "base5" | "overview"

export function StudioShell() {
  const sourceMode = useEditorStore((s) => s.sourceMode)
  const modeBResult = useEditorStore((s) => s.modeBResult)
  const genParams = useEditorStore((s) => s.genParams)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportTarget, setExportTarget] = useState<LibraryAsset | null>(null)
  const [centerTab, setCenterTab] = useState<"gridpick" | "template" | "testmap">("gridpick")
  // 手绘模式工作区两视图
  const [drawTab, setDrawTab] = useState<WorkbenchTab>("base5")
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  const hasBase = Object.keys(baseCanvases).length > 0
  // 手绘测试区宽度（px）：可通过分隔条左右拖拽调整
  const [testW, setTestW] = useState(360)
  const testResizeRef = useRef<{ startX: number; startW: number } | null>(null)

  // 测试区分隔条拖拽：改变 testW，范围 200 ~ 窗口 60%
  function onTestResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    testResizeRef.current = { startX: e.clientX, startW: testW }
    const onMove = (ev: PointerEvent) => {
      const r = testResizeRef.current
      if (!r) return
      const next = r.startW + (r.startX - ev.clientX)
      const max = Math.round(window.innerWidth * 0.6)
      setTestW(Math.min(max, Math.max(200, next)))
    }
    const onUp = () => {
      testResizeRef.current = null
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  function handleExportClick() {
    if (sourceMode === "procedural") {
      // 程序生成模式：直接用当前参数实时生成图块集导出
      const asset = generateTileAsset("程序生成纹理", mappingType, tileSize, genParams)
      setExportTarget(asset)
    } else if (sourceMode === "draw") {
      // 手绘模式：从 baseCanvases 实时派生瓦片构造导出资产
      const tiles = deriveTilesFromBase(baseCanvases, mappingType, tileSize)
      if (tiles.size === 0) {
        toast.error("尚无基础像素，请先绘制或「固化为像素」")
        return
      }
      const thumb = (tiles.get(15) ?? tiles.values().next().value).toDataURL("image/png")
      const asset: TileAsset = {
        id: `draw-${Date.now()}`,
        name: "手绘纹理",
        kind: "autotile",
        mappingType,
        tileSize,
        params: { ...genParams },
        tiles,
        thumbnail: thumb,
        createdAt: Date.now(),
      }
      setExportTarget(asset)
    } else {
      // 切图模式：统一导出右上角「导出」按钮，将生成的模板包装为图块资产
      if (!modeBResult || modeBResult.tiles.size === 0) {
        toast.error("尚无模板，请先在切图模式绑定槽位并生成模板")
        return
      }
      const first = modeBResult.tiles.values().next().value
      const asset: TileAsset = {
        id: `slice-${Date.now()}`,
        name: "切片模板",
        kind: "autotile",
        mappingType: modeBResult.mappingType,
        tileSize: modeBResult.tileSize,
        params: { ...genParams },
        tiles: modeBResult.tiles,
        thumbnail: first.toDataURL("image/png"),
        createdAt: Date.now(),
      }
      setExportTarget(asset)
    }
    setExportOpen(true)
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <TopBar onExport={handleExportClick} />

      <div className="flex flex-1 overflow-hidden">
        {sourceMode !== "draw" && (
          <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-sidebar">
            {sourceMode === "procedural" && <ModeAPanel />}
            {sourceMode === "slice" && <ModeBPanel />}
          </aside>
        )}

        <main className="flex flex-1 flex-col overflow-hidden">
          {sourceMode === "slice" ? (
            <>
              <div className="border-b border-border bg-sidebar px-4 py-2">
                <Tabs value={centerTab} onValueChange={(v) => setCenterTab(v as "gridpick" | "template" | "testmap")}>
                  <TabsList>
                    <TabsTrigger value="gridpick">拾取切片</TabsTrigger>
                    <TabsTrigger value="template" disabled={!modeBResult}>
                      生成模板{modeBResult ? ` (${modeBResult.tiles.size})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="testmap" disabled={!modeBResult}>
                      测试地图
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex-1 overflow-hidden">
                {centerTab === "gridpick" && <ModeBGridView />}
                {centerTab === "template" && <ModeBTemplateView onBack={() => setCenterTab("gridpick")} />}
                {centerTab === "testmap" && <ModeBTestMap onBack={() => setCenterTab("gridpick")} />}
              </div>
            </>
          ) : sourceMode === "draw" ? (
            // 手绘模式：左侧绘制区 + 右侧测试区分屏，隐藏参数化生成面板
            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-border bg-sidebar px-4 py-2">
                <Tabs value={drawTab} onValueChange={(v) => setDrawTab(v as WorkbenchTab)}>
                  <TabsList>
                    <TabsTrigger value="base5">基础 5 块</TabsTrigger>
                    <TabsTrigger value="overview">16/47 总览</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="min-h-0 flex-1 overflow-hidden">
                  {drawTab === "base5" && <ModeCCanvas />}
                  {drawTab === "overview" && <ModeCOverview />}
                </div>
                {hasBase && (
                  <>
                    {/* 可拖拽分隔条：调整绘制区与测试区的比例 */}
                    <div
                      onPointerDown={onTestResizeDown}
                      className="group flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center border-l border-border bg-sidebar transition-colors hover:bg-accent"
                      title="拖拽调整测试区宽度（左/右）"
                    >
                      <div className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-primary/70" />
                    </div>
                    <div className="flex shrink-0 flex-col" style={{ width: testW }}>
                      <ModeCTestMap />
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <ModeACanvas />
          )}
        </main>
      </div>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} asset={exportTarget} />
    </div>
  )
}
