"use client"

import { useEffect } from "react"
import { useEditorStore } from "@/lib/store"
import { ModeAPreview } from "@/components/tile-studio/mode-a-preview"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RefreshCw, Lock, Unlock, TriangleAlert } from "lucide-react"
import { HoverHelp } from "@/components/ui/hover-help"

const SWATCHES = ["#6fae4a", "#8a6642", "#5b8fc7", "#c77b5b", "#9b6fc7", "#c7ab4a", "#4ac7b0", "#c74a6f"]

export function ModeAPanel() {
  const genParams = useEditorStore((s) => s.genParams)
  const setGenParams = useEditorStore((s) => s.setGenParams)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const sourceMode = useEditorStore((s) => s.sourceMode)
  const baseDirty = useEditorStore((s) => s.baseDirty)
  const baseLocked = useEditorStore((s) => s.baseLocked)
  const paramDirty = useEditorStore((s) => s.paramDirty)
  const hasBase = useEditorStore((s) => Object.keys(s.baseCanvases).length > 0)
  const regenerate = useEditorStore((s) => s.regenerateBaseFromParams)
  const revertGenParams = useEditorStore((s) => s.revertGenParams)
  const setBaseLocked = useEditorStore((s) => s.setBaseLocked)

  // 参数实时生成：干净状态（无手绘修改、未锁定）下参数变化防抖写入 5 块基础块；
  // 脏状态下不自动覆写，改由确认条（确认覆写 / 锁定手绘 / 还原参数）接管。
  useEffect(() => {
    if (sourceMode !== "procedural" || baseLocked || baseDirty) return
    if (!paramDirty && hasBase) return
    const t = setTimeout(regenerate, 160)
    return () => clearTimeout(t)
  }, [sourceMode, baseLocked, baseDirty, paramDirty, hasBase, regenerate])

  function randomizeSeed() {
    setGenParams({ seed: Math.floor(Math.random() * 1_000_000) })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-sidebar p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-sans text-sm font-semibold text-foreground">参数化生成</h2>
            <p className="text-[11px] text-muted-foreground">
              {mappingType === "16" ? "16" : "47"} 张 · {tileSize}px
              {baseLocked ? " · 已锁定" : baseDirty ? " · 含手绘修改" : " · 实时联动"}
            </p>
          </div>
          {baseLocked ? (
            <Button size="sm" variant="outline" onClick={() => setBaseLocked(false)} title="解除锁定后参数恢复实时写入">
              <Unlock data-icon="inline-start" />
              解除锁定
            </Button>
          ) : baseDirty ? (
            <Button size="sm" variant="outline" onClick={() => setBaseLocked(true)} title="锁定后参数不再写入基础块">
              <Lock data-icon="inline-start" />
              锁定手绘
            </Button>
          ) : null}
        </div>
        <ModeAPreview tileSize={tileSize} params={genParams} mappingType={mappingType} />
      </div>

      {/* 防误触闸门：脏状态下调参不覆写，交由用户决策 */}
      {baseDirty && paramDirty && !baseLocked && (
        <div className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5 shrink-0" />
            基础块包含手绘 / 切片修改，参数调整不会自动应用
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="xs" onClick={regenerate} title="用当前参数重生成基础块（手绘修改将被覆盖）">
              确认覆写
            </Button>
            <Button size="xs" variant="outline" onClick={() => setBaseLocked(true)} title="保留画布现状，参数仅影响预览">
              锁定手绘
            </Button>
            <Button size="xs" variant="ghost" onClick={revertGenParams} title="回退到最近一次写入画布的参数">
              还原参数
            </Button>
          </div>
        </div>
      )}
      {baseLocked && paramDirty && (
        <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            已锁定手绘，参数修改暂不写入画布
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="xs" onClick={() => { setBaseLocked(false); regenerate() }} title="用当前参数重生成基础块并恢复实时联动">
              应用并解锁
            </Button>
            <Button size="xs" variant="ghost" onClick={revertGenParams}>
              还原参数
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>颜色</FieldLabel>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={genParams.color}
                onChange={(e) => setGenParams({ color: e.target.value })}
                className="size-9 cursor-pointer rounded-md border border-input bg-transparent p-1"
                aria-label="选择基础颜色"
              />
              <Input value={genParams.color} onChange={(e) => setGenParams({ color: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setGenParams({ color: c })}
                  className="size-5 rounded-full ring-1 ring-border ring-offset-1 ring-offset-card transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                  aria-label={`使用颜色 ${c}`}
                />
              ))}
            </div>
          </Field>

          <div className="h-px bg-border" />

          <Field>
            <div className="flex items-center justify-between">
              <HoverHelp label={<FieldLabel>腐蚀强度</FieldLabel>}>
                <p className="mb-1 font-medium">腐蚀强度</p>
                <p>控制草/空地边界的腐蚀噪声幅度（0~1）。值越大，边缘越参差破碎，与 16 双网格算法语义一致。</p>
              </HoverHelp>
              <span className="font-mono text-xs text-muted-foreground">{genParams.erosionStrength.toFixed(2)}</span>
            </div>
            <Slider value={genParams.erosionStrength} onValueChange={(v) => setGenParams({ erosionStrength: v as number })} min={0} max={1} step={0.05} />
          </Field>

          <Field>
            <div className="flex items-center justify-between">
              <HoverHelp label={<FieldLabel>边缘厚度</FieldLabel>}>
                <p className="mb-1 font-medium">边缘厚度</p>
                <p>腐蚀带的基础宽度（1~6）。值越大，边界被削去的范围越宽。</p>
              </HoverHelp>
              <span className="font-mono text-xs text-muted-foreground">{genParams.edgeThickness}</span>
            </div>
            <Slider value={genParams.edgeThickness} onValueChange={(v) => setGenParams({ edgeThickness: v as number })} min={1} max={6} step={1} />
          </Field>

          <Field>
            <div className="flex items-center justify-between">
              <HoverHelp label={<FieldLabel>边缘高光</FieldLabel>}>
                <p className="mb-1 font-medium">边缘高光</p>
                <p>0 关闭边缘阴影/高光（纯色平铺），大于 0 时在腐蚀边缘外沿绘制暗边 + 亮边。16 与 47 映射共用此参数。</p>
              </HoverHelp>
              <span className="font-mono text-xs text-muted-foreground">{genParams.edgeHighlight.toFixed(2)}</span>
            </div>
            <Slider value={genParams.edgeHighlight} onValueChange={(v) => setGenParams({ edgeHighlight: v as number })} min={0} max={1} step={0.05} />
          </Field>

          <Field>
            <FieldLabel htmlFor="seed">随机种子</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id="seed" value={genParams.seed} onChange={(e) => setGenParams({ seed: Number(e.target.value) || 0 })} className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={randomizeSeed} aria-label="随机种子">
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </div>
    </div>
  )
}
