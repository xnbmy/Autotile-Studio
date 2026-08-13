"use client"

import { useEditorStore } from "@/lib/store"
import { generateBaseCanvases } from "@/lib/asset-factory"
import { ModeAPreview } from "@/components/tile-studio/mode-a-preview"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RefreshCw, Brush } from "lucide-react"
import { HoverHelp } from "@/components/ui/hover-help"
import { toast } from "sonner"

const SWATCHES = ["#6fae4a", "#8a6642", "#5b8fc7", "#c77b5b", "#9b6fc7", "#c7ab4a", "#4ac7b0", "#c74a6f"]

export function ModeAPanel() {
  const genParams = useEditorStore((s) => s.genParams)
  const setGenParams = useEditorStore((s) => s.setGenParams)
  const mappingType = useEditorStore((s) => s.mappingType)
  const tileSize = useEditorStore((s) => s.tileSize)
  const setBaseCanvases = useEditorStore((s) => s.setBaseCanvases)
  const setSourceMode = useEditorStore((s) => s.setSourceMode)
  const setOverrides = useEditorStore((s) => s.setOverrides)

  function randomizeSeed() {
    setGenParams({ seed: Math.floor(Math.random() * 1_000_000) })
  }

  // P1.6：把当前参数生成的图块集固化为 5 块像素，写入 baseCanvases 并切到手绘模式
  function handleFreezeToPixels() {
    const base = generateBaseCanvases(mappingType, tileSize, genParams)
    setBaseCanvases(base)
    setOverrides({}) // 固化时清空旧的单格微调
    setSourceMode("draw")
    toast.success("已固化为像素", {
      description: `${mappingType} 映射 · ${Object.keys(base).length} 个基础块已写入手绘画布`,
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-sidebar p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-sans text-sm font-semibold text-foreground">参数化生成</h2>
            <p className="text-[11px] text-muted-foreground">{mappingType === "16" ? "16" : "47"} 张 · {tileSize}px</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleFreezeToPixels}>
            <Brush data-icon="inline-start" />
            固化为像素
          </Button>
        </div>
        <ModeAPreview tileSize={tileSize} params={genParams} mappingType={mappingType} />
      </div>

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
