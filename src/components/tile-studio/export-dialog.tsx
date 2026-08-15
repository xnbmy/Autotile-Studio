"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { isTauri } from "@tauri-apps/api/core"
import { saveCanvasAsPNG } from "@/lib/export-presets"
import { composeSheet } from "@/lib/tileset-composer"
import { BLOB_STANDARD_ORDER, BLOB_STANDARD_COLUMNS } from "@/lib/tile-mapping"
import { DUAL_COLUMNS, DUAL_STANDARD_ORDER } from "@/lib/dual-grid"
import { DUAL_GRID_16_ORDER } from "@/lib/quadrant-stitch"
import { toast } from "sonner"
import type { LibraryAsset } from "@/lib/types"
import { Download } from "lucide-react"

export function ExportDialog({ open, onOpenChange, asset }: { open: boolean; onOpenChange: (v: boolean) => void; asset: LibraryAsset | null }) {
  // 仅保留标准排版：可调横向/纵向图块间距（px）
  const [spacingX, setSpacingX] = useState(0)
  const [spacingY, setSpacingY] = useState(0)

  if (!asset) return null

  async function handleExport() {
    if (!asset) return
    let order: (number | null)[]
    let columns: number

    if (asset.kind === "autotile" && asset.mappingType === "16") {
      // 16-tile 映射表：标准 4×4 双网格排列（与预览一致）
      order = DUAL_GRID_16_ORDER
      columns = DUAL_COLUMNS
    } else if (asset.kind === "autotile" && asset.mappingType === "47") {
      // 47-tile 映射表：标准 5×11 blob 排列
      order = BLOB_STANDARD_ORDER
      columns = BLOB_STANDARD_COLUMNS
    } else {
      // dualgrid 资产：4×4 双网格排列
      order = DUAL_STANDARD_ORDER
      columns = DUAL_COLUMNS
    }

    const orderedTiles = order.map((key) => {
      if (key == null) return { key: -1, canvas: null }
      return { key, canvas: asset.tiles.get(key) ?? null }
    })
    const sheet = composeSheet(orderedTiles, {
      tileSize: asset.tileSize,
      columns,
      margin: 0,
      spacingX,
      spacingY,
    })
    const filename = `${asset.name.replace(/\s+/g, "_")}_standard`
    // Tauri 环境弹出系统「另存为」对话框选择目标文件夹；非 Tauri 回退浏览器下载
    const path = await saveCanvasAsPNG(sheet.canvas, `${filename}.png`)
    if (path) {
      toast.success("已导出标准排版 Tilesheet", { description: `已保存到 ${path}` })
    } else if (!isTauri()) {
      // 非 Tauri：浏览器回退下载成功；Tauri 下为空表示用户取消了保存对话框，不提示
      toast.success("已导出标准排版 Tilesheet", {
        description: `${asset.tiles.size} 个图块 · ${sheet.width}×${sheet.height}px · 横向间距 ${spacingX}px · 纵向间距 ${spacingY}px`,
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导出 Tilesheet</DialogTitle>
          <DialogDescription>标准排版导出，可调整图块间距；点击「导出」下载 PNG。</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
          <div
            className="size-12 shrink-0 rounded-md bg-checkerboard ring-1 ring-border"
            style={{ backgroundImage: `url(${asset.thumbnail})`, backgroundSize: "cover", imageRendering: "pixelated" }}
          />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{asset.name}</span>
            <span className="text-xs text-muted-foreground">
              {asset.kind === "autotile" ? `${asset.mappingType}-tile · ${asset.tiles.size} 张 · ${asset.tileSize}px` : `双网格过渡 · 16 张 · ${asset.tileSize}px`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>横向间距 (px)</FieldLabel>
            <Input
              type="number"
              min={0}
              step={1}
              value={spacingX}
              onChange={(e) => setSpacingX(Math.max(0, Number(e.target.value) || 0))}
              className="font-mono text-sm"
            />
          </Field>
          <Field>
            <FieldLabel>纵向间距 (px)</FieldLabel>
            <Input
              type="number"
              min={0}
              step={1}
              value={spacingY}
              onChange={(e) => setSpacingY(Math.max(0, Number(e.target.value) || 0))}
              className="font-mono text-sm"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleExport}>
            <Download data-icon="inline-start" />
            导出
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
