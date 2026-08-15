"use client"

import { useEditorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Pencil,
  Eraser,
  Pipette,
  PaintBucket,
  SquareDashed,
  Slash,
  Infinity as InfinityIcon,
  Contrast,
  Grid3x3,
  Undo2,
  Redo2,
} from "lucide-react"
import type { DrawTool } from "@/lib/types"

interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

// 绘制工具箱（手绘模式）：铅笔/橡皮/吸管/油漆桶/矩形/线条 + 通透/色差/网格 + 撤销/重做 + 笔刷颜色/大小
const DRAW_TOOLS: { value: DrawTool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "pencil", label: "铅笔", icon: Pencil },
  { value: "eraser", label: "橡皮", icon: Eraser },
  { value: "picker", label: "吸管", icon: Pipette },
  { value: "fill", label: "油漆桶", icon: PaintBucket },
  { value: "rect", label: "矩形", icon: SquareDashed },
  { value: "line", label: "线条", icon: Slash },
]

function hexToRgba(hex: string): RGBA {
  const h = hex.replace("#", "")
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  const v = Number.parseInt(n, 16)
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: 255 }
}

function rgbaCss(c: RGBA): string {
  return `rgba(${c.r},${c.g},${c.b},${c.a / 255})`
}

export function DrawToolbar() {
  const drawTool = useEditorStore((s) => s.drawTool)
  const setDrawTool = useEditorStore((s) => s.setDrawTool)
  const drawTileTransparent = useEditorStore((s) => s.drawTileTransparent)
  const setDrawTileTransparent = useEditorStore((s) => s.setDrawTileTransparent)
  const drawTileColorDiff = useEditorStore((s) => s.drawTileColorDiff)
  const setDrawTileColorDiff = useEditorStore((s) => s.setDrawTileColorDiff)
  const drawShowGrid = useEditorStore((s) => s.drawShowGrid)
  const setDrawShowGrid = useEditorStore((s) => s.setDrawShowGrid)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const canUndo = useEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useEditorStore((s) => s.redoStack.length > 0)
  const color = useEditorStore((s) => s.drawColor)
  const colorSlots = useEditorStore((s) => s.colorSlots)
  const commitDrawColor = useEditorStore((s) => s.commitDrawColor)
  const pickColorSlot = useEditorStore((s) => s.pickColorSlot)
  const brushSize = useEditorStore((s) => s.brushSize)
  const setBrushSize = useEditorStore((s) => s.setBrushSize)

  const sameColor = (a: RGBA, b: RGBA) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-md border border-border bg-muted/40 p-1">
        {/* 绘制工具：铅笔 + 画笔/橡皮大小（紧随铅笔，number 输入含上下箭头） */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={drawTool === "pencil" ? "secondary" : "ghost"}
                  onClick={() => setDrawTool("pencil")}
                  aria-label="铅笔"
                  title="铅笔"
                />
              }
            >
              <Pencil className="size-4" />
            </TooltipTrigger>
            <TooltipContent>铅笔</TooltipContent>
          </Tooltip>
          <div className="ml-0.5 flex items-center gap-0.5" title="画笔/橡皮大小（像素）">
            <Input
              type="number"
              min={1}
              max={16}
              step={1}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="h-6 w-10 px-1 text-center font-mono text-xs"
            />
            <span className="text-[10px] text-muted-foreground">px</span>
          </div>
          {DRAW_TOOLS.filter((t) => t.value !== "pencil").map((t) => (
            <Tooltip key={t.value}>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant={drawTool === t.value ? "secondary" : "ghost"}
                    onClick={() => setDrawTool(t.value)}
                    aria-label={t.label}
                    title={t.label}
                  />
                }
              >
                <t.icon className="size-4" />
              </TooltipTrigger>
              <TooltipContent>{t.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <span className="h-4 w-px bg-border" />

        {/* 通透 / 色差 / 网格 */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={drawTileTransparent ? "secondary" : "ghost"}
                  onClick={() => setDrawTileTransparent(!drawTileTransparent)}
                  aria-label="∞ 通透绘制"
                  title="∞ 通透绘制"
                />
              }
            >
              <InfinityIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>∞ 通透绘制（越界回绕）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={drawTileColorDiff ? "secondary" : "ghost"}
                  onClick={() => setDrawTileColorDiff(!drawTileColorDiff)}
                  aria-label="色差显示"
                  title="色差显示"
                />
              }
            >
              <Contrast className="size-4" />
            </TooltipTrigger>
            <TooltipContent>色差显示（周围副本半透明偏暗）</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant={drawShowGrid ? "secondary" : "ghost"}
                  onClick={() => setDrawShowGrid(!drawShowGrid)}
                  aria-label="网格显示"
                  title="网格显示"
                />
              }
            >
              <Grid3x3 className="size-4" />
            </TooltipTrigger>
            <TooltipContent>像素网格显示</TooltipContent>
          </Tooltip>
        </div>

        <span className="h-4 w-px bg-border" />

        {/* 撤销 / 重做 */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon-sm" variant="ghost" onClick={undo} disabled={!canUndo} aria-label="撤销" title="撤销" />
              }
            >
              <Undo2 className="size-4" />
            </TooltipTrigger>
            <TooltipContent>撤销</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon-sm" variant="ghost" onClick={redo} disabled={!canRedo} aria-label="重做" title="重做" />
              }
            >
              <Redo2 className="size-4" />
            </TooltipTrigger>
            <TooltipContent>重做</TooltipContent>
          </Tooltip>
        </div>

        <span className="h-4 w-px bg-border" />

        {/* 笔刷颜色槽（10 个）：修改颜色时从左往右循环存储；点击或快捷键 1~9、0 切换 */}
        <div
          className="flex items-center gap-1"
          title="颜色槽：修改颜色时自动从左往右循环存储；点击槽位或按快捷键 1~9、0 切换"
        >
          {colorSlots.map((c, i) => {
            const key = i === 9 ? "0" : String(i + 1)
            return (
              <button
                key={i}
                type="button"
                onClick={() => pickColorSlot(i)}
                disabled={!c}
                title={c ? `颜色槽 ${i + 1}（快捷键 ${key}）` : `空槽（修改颜色后自动填充，快捷键 ${key}）`}
                className={`size-5 rounded border ${
                  c
                    ? sameColor(color, c)
                      ? "border-white ring-1 ring-white"
                      : "border-black/30"
                    : "cursor-default border border-dashed border-zinc-600 bg-zinc-800/40"
                }`}
                style={c ? { background: rgbaCss(c) } : undefined}
              />
            )
          })}
          <input
            type="color"
            value={`#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`}
            onChange={(e) => commitDrawColor(hexToRgba(e.target.value))}
            className="size-6 cursor-pointer rounded border border-zinc-700 bg-transparent"
            title="自定义颜色（选中的颜色自动存入下一个颜色槽）"
          />
          <span
            className="ml-0.5 inline-block size-4 rounded-sm border border-black/30"
            style={{ background: rgbaCss(color) }}
            title={color.a === 0 ? "透明" : rgbaCss(color)}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}
