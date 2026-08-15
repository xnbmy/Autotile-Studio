"use client"

import { useState } from "react"
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from "react-resizable-panels"
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react"
import { useEditorStore } from "@/lib/store"
import { generateTileAsset } from "@/lib/asset-factory"
import {
  deriveTilesFromBase,
  applyOverrides,
  generateQuadrantStitch,
  DUAL16_SLOT_KEYS,
  BLOB5_SLOT_KEYS,
} from "@/lib/quadrant-stitch"
import { TopBar } from "@/components/tile-studio/top-bar"
import { ModeAPanel } from "@/components/tile-studio/mode-a-panel"
import { ModeBPanel } from "@/components/tile-studio/mode-b-panel"
import ModeCCanvas from "@/components/tile-studio/mode-c-canvas"
import { DrawToolbar } from "@/components/tile-studio/draw-toolbar"
import { ModeCOverview } from "@/components/tile-studio/mode-c-overview"
import ModeCTestMap from "@/components/tile-studio/mode-c-test-map"
import { ExportDialog } from "@/components/tile-studio/export-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LibraryAsset, SourceMode, TileAsset } from "@/lib/types"
import { toast } from "sonner"

/** 水平分隔条（左右面板）：拖拽调宽 + 悬停折叠开关 + 双击复位（库内置） */
function VSplit({ collapsed, onToggle, side }: { collapsed: boolean; onToggle: () => void; side: "left" | "right" }) {
  const Icon = side === "left" ? (collapsed ? ChevronRight : ChevronLeft) : collapsed ? ChevronLeft : ChevronRight
  return (
    <Separator className="group relative flex w-1.5 shrink-0 items-center justify-center bg-border/50 transition-colors hover:bg-primary/40">
      <div className="pointer-events-none h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-primary/70" />
      <button
        type="button"
        aria-label={collapsed ? "展开面板" : "折叠面板"}
        title={collapsed ? "展开面板" : "折叠面板（双击分隔条恢复默认布局）"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        className={`absolute inset-y-0 left-1/2 z-10 flex w-4 -translate-x-1/2 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground ${
          collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Icon className="size-3.5" />
      </button>
    </Separator>
  )
}

/** 垂直分隔条（上下面板）：拖拽调高 + 悬停折叠开关 + 双击复位（库内置） */
function HSplit({ collapsed, onToggle, side }: { collapsed: boolean; onToggle: () => void; side: "top" | "bottom" }) {
  const Icon = side === "top" ? (collapsed ? ChevronDown : ChevronUp) : collapsed ? ChevronUp : ChevronDown
  return (
    <Separator className="group relative flex h-1.5 w-full shrink-0 items-center justify-center bg-border/50 transition-colors hover:bg-primary/40">
      <div className="pointer-events-none h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-primary/70" />
      <button
        type="button"
        aria-label={collapsed ? "展开面板" : "折叠面板"}
        title={collapsed ? "展开面板" : "折叠面板（双击分隔条恢复默认布局）"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        className={`absolute inset-x-0 top-1/2 z-10 flex h-4 -translate-y-1/2 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground ${
          collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Icon className="size-3.5" />
      </button>
    </Separator>
  )
}

export function StudioShell() {
  const sourceMode = useEditorStore((s) => s.sourceMode)
  const setSourceMode = useEditorStore((s) => s.setSourceMode)
  const genParams = useEditorStore((s) => s.genParams)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const baseCanvases = useEditorStore((s) => s.baseCanvases)
  const overrides = useEditorStore((s) => s.overrides)
  const hasBase = Object.keys(baseCanvases).length > 0

  const [exportOpen, setExportOpen] = useState(false)
  const [exportTarget, setExportTarget] = useState<LibraryAsset | null>(null)

  // 弹性三栏：布局拖拽后记忆到 localStorage
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "autotile-workbench" })
  const leftPanel = usePanelRef()
  const rightPanel = usePanelRef()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  // 中栏上下两区（基础块 / 16·47 总览）：高度拖拽后记忆到 localStorage
  const { defaultLayout: centerLayout, onLayoutChanged: onCenterLayoutChanged } = useDefaultLayout({
    id: "autotile-workbench-center",
  })
  const overviewPanel = usePanelRef()
  const [overviewCollapsed, setOverviewCollapsed] = useState(false)

  async function handleExportClick() {
    if (sourceMode === "slice") {
      // 切图模式：从绑定槽位直接拼合导出（47 模式恒定 5 块简化）
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
    } else if (hasBase) {
      // 参数 / 手绘：从 baseCanvases 实时派生（含单格微调），手绘修改一并导出
      const tiles = applyOverrides(deriveTilesFromBase(baseCanvases, mappingType, tileSize), overrides)
      if (tiles.size === 0) {
        toast.error("尚无基础像素，请在中间画布绘制")
        return
      }
      const thumb = (tiles.get(15) ?? tiles.values().next().value!).toDataURL("image/png")
      const asset: TileAsset = {
        id: `work-${Date.now()}`,
        name: "当前图块",
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
      // 兜底：无基础像素时按参数直接生成（正常情况下参数页会实时写入基础块）
      setExportTarget(generateTileAsset("程序生成纹理", mappingType, tileSize, genParams))
    }
    setExportOpen(true)
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <TopBar onExport={handleExportClick} />

      <Group
        orientation="horizontal"
        id="workbench"
        className="min-h-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        {/* 左：输入面板（参数生成 / 图片导入，切换按钮在左栏顶部） */}
        <Panel
          id="input"
          defaultSize="22%"
          minSize="14%"
          collapsible
          panelRef={leftPanel}
          onResize={(size) => setLeftCollapsed(size.asPercentage <= 0.5)}
          className="h-full min-h-0"
        >
          <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-sidebar">
            <div className="shrink-0 border-b border-border bg-sidebar px-3 py-2">
              <Tabs value={sourceMode} onValueChange={(v) => setSourceMode(v as SourceMode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="procedural" className="flex-1">参数生成</TabsTrigger>
                  <TabsTrigger value="slice" className="flex-1">图片导入</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {sourceMode === "procedural" ? <ModeAPanel /> : <ModeBPanel />}
            </div>
          </aside>
        </Panel>

        <VSplit
          side="left"
          collapsed={leftCollapsed}
          onToggle={() => (leftCollapsed ? leftPanel.current?.expand() : leftPanel.current?.collapse())}
        />

        {/* 中：上下两区 —— 顶部工具栏，其下 5 块基础画布 + 16/47 总览，分隔条可上下拖拽 */}
        <Panel id="work" minSize="30%" className="h-full min-h-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-center border-b border-border bg-sidebar px-3 py-1.5">
              <DrawToolbar />
            </div>
            <Group
              orientation="vertical"
              id="workbench-center"
              className="min-h-0 flex-1"
              defaultLayout={centerLayout}
              onLayoutChanged={onCenterLayoutChanged}
            >
              <Panel id="canvas" defaultSize="55%" minSize="20%" className="h-full min-h-0">
                <main className="flex h-full min-w-0 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ModeCCanvas />
                  </div>
                </main>
              </Panel>

              <HSplit
                side="top"
                collapsed={overviewCollapsed}
                onToggle={() => (overviewCollapsed ? overviewPanel.current?.expand() : overviewPanel.current?.collapse())}
              />

              <Panel
                id="overview"
                defaultSize="45%"
                minSize="15%"
                collapsible
                panelRef={overviewPanel}
                onResize={(size) => setOverviewCollapsed(size.asPercentage <= 0.5)}
                className="h-full min-h-0"
              >
                <ModeCOverview />
              </Panel>
            </Group>
          </div>
        </Panel>

        <VSplit
          side="right"
          collapsed={rightCollapsed}
          onToggle={() => (rightCollapsed ? rightPanel.current?.expand() : rightPanel.current?.collapse())}
        />

        {/* 右：测试地图（常驻，不再与总览做页签切换） */}
        <Panel
          id="verify"
          defaultSize="30%"
          minSize="16%"
          collapsible
          panelRef={rightPanel}
          onResize={(size) => setRightCollapsed(size.asPercentage <= 0.5)}
          className="h-full min-h-0"
        >
          <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-sidebar">
            <ModeCTestMap />
          </aside>
        </Panel>
      </Group>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} asset={exportTarget} />
    </div>
  )
}
