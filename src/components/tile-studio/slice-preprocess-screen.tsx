"use client"

import { useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { HoverHelp } from "@/components/ui/hover-help"
import { Switch } from "@/components/ui/switch"
import { ZoomableCanvas } from "@/components/ui/zoomable-canvas"
import { Upload, Check, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import {
  pixelDownsample,
  imageDataToDataURL,
  loadImageToData,
  DEFAULT_PREPROCESS,
  type PreprocessParams,
} from "@/lib/pixel-preprocess"

const RES_PRESETS: [number, number][] = [
  [32, 32],
  [64, 64],
  [128, 128],
  [256, 256],
]

/**
 * 图片导入路径 · 步骤 ②：像素处理界面（预处理）。
 * 参照「自然像素化实验室 V3」：目标分辨率 + 暗部/对比度 + 中值切割调色板
 * + 块平均重采样 + Bayer 抖动 + Despeckle。左侧原图，右侧处理结果。
 */
export function SlicePreprocessScreen() {
  const fileRef = useRef<HTMLInputElement>(null)
  const finishPreprocess = useEditorStore((s) => s.finishPreprocess)
  const setModeBImage = useEditorStore((s) => s.setModeBImage)

  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null)
  const [params, setParams] = useState<PreprocessParams>({ ...DEFAULT_PREPROCESS })
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null)
  const [aspect, setAspect] = useState(1)
  const [lockRatio, setLockRatio] = useState(true)
  const [processing, setProcessing] = useState(false)

  const srcCanvasRef = useRef<HTMLCanvasElement>(null)
  const outCanvasRef = useRef<HTMLCanvasElement>(null)

  // 防抖：滑块/输入连续变化时，等停顿 150ms 后再执行主处理 effect，避免拖动时反复全量重算导致卡顿
  const [debouncedParams, setDebouncedParams] = useState(params)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedParams(params), 150)
    return () => clearTimeout(t)
  }, [params])

  // 处理中：读取源图 → 像素化 → 写回结果 canvas
  useEffect(() => {
    if (!sourceDataUrl) return
    let cancelled = false
    setProcessing(true)
    ;(async () => {
      try {
        const { data } = await loadImageToData(sourceDataUrl)
        if (cancelled) return
        const out = pixelDownsample(data, debouncedParams)
        if (cancelled) return
        drawToCanvas(out, outCanvasRef.current)
        setResultDataUrl(imageDataToDataURL(out))
      } catch (err) {
        if (!cancelled) toast.error("预处理失败", { description: err instanceof Error ? err.message : "未知错误" })
      } finally {
        if (!cancelled) setProcessing(false)
      }
    })()
    return () => { cancelled = true }
  }, [sourceDataUrl, debouncedParams])

  function drawToCanvas(img: ImageData, canvas: HTMLCanvasElement | null) {
    if (!canvas) return
    canvas.width = img.width
    canvas.height = img.height
    canvas.getContext("2d")!.putImageData(img, 0, 0)
  }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const a = img.width / img.height
        setAspect(a)
        // 大图压到 800 上限便于预览
        let w = img.width, h = img.height
        if (w > 800 || h > 800) {
          if (w > h) { h = Math.round(h * (800 / w)); w = 800 }
          else { w = Math.round(w * (800 / h)); h = 800 }
        }
        const cv = srcCanvasRef.current
        if (cv) {
          cv.width = w
          cv.height = h
          const ctx = cv.getContext("2d")!
          ctx.imageSmoothingEnabled = false
          ctx.drawImage(img, 0, 0, w, h)
        }
        setSourceDataUrl(url)
        // 锁比例时按原图宽高比修正目标高
        setParams((p) => (lockRatio ? { ...p, targetH: Math.max(8, Math.round(p.targetW / a)) } : p))
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }

  function setTargetW(w: number) {
    setParams((p) => {
      const next = Math.max(8, Math.min(512, Math.round(w)))
      return lockRatio
        ? { ...p, targetW: next, targetH: Math.max(8, Math.round(next / aspect)) }
        : { ...p, targetW: next }
    })
  }
  function setTargetH(h: number) {
    setParams((p) => {
      const next = Math.max(8, Math.min(512, Math.round(h)))
      return lockRatio
        ? { ...p, targetH: next, targetW: Math.max(8, Math.round(next * aspect)) }
        : { ...p, targetH: next }
    })
  }

  function handleConfirm() {
    if (!resultDataUrl) {
      toast.error("尚未生成处理结果，请先导入图片")
      return
    }
    // 把预处理后的图写回 modeBImage，供切图使用
    const img = new Image()
    img.onload = () => {
      setModeBImage(resultDataUrl, { w: img.width, h: img.height })
      finishPreprocess()
    }
    img.src = resultDataUrl
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        {/* 左：控制面板 */}
        <div className="flex w-[320px] shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar p-4">
          <div className="mb-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">图片预处理</div>
            <p className="mt-1 text-[11px] text-muted-foreground">像素化缩放 / 调色板量化，处理结果将用于切图</p>
          </div>

          {/* 1. 图片来源 */}
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-semibold text-foreground">1. 图片来源</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload data-icon="inline-start" />
              {sourceDataUrl ? "更换图片" : "导入图片"}
            </Button>
          </div>

          {/* 2. 目标分辨率 */}
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-semibold text-foreground">2. 目标像素分辨率</div>
            <div className="mb-2 grid grid-cols-4 gap-1">
              {RES_PRESETS.map(([w, h]) => (
                <button
                  key={`${w}x${h}`}
                  type="button"
                  onClick={() => setTargetW(w)}
                  className={`rounded-md border px-1 py-1 text-[11px] transition-colors ${
                    params.targetW === w
                      ? "border-primary bg-primary/10 font-bold text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {w}×{h}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min={8} max={512} value={params.targetW}
                onChange={(e) => setTargetW(Number(e.target.value) || 64)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-center font-mono text-xs"
              />
              <span className="text-muted-foreground">×</span>
              <input
                type="number" min={8} max={512} value={params.targetH}
                onChange={(e) => setTargetH(Number(e.target.value) || 64)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-center font-mono text-xs"
              />
            </div>
            <label className="mt-2 flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
              <span>锁定原图宽高比</span>
              <Switch checked={lockRatio} onCheckedChange={setLockRatio} size="sm" />
            </label>
          </div>

          {/* 3. 曝光与对比度 */}
          <Field className="mb-4 gap-3">
            <FieldLabel>3. 画面曝光与暗部增强</FieldLabel>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>暗部细节提亮</span>
                <span className="font-mono text-primary">{Math.round(params.shadowBoost * 100)}%</span>
              </span>
              <input
                type="range" min={0} max={100} step={5} value={params.shadowBoost * 100}
                onChange={(e) => setParams((p) => ({ ...p, shadowBoost: Number(e.target.value) / 100 }))}
                className="w-full accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>对比度增强</span>
                <span className="font-mono text-primary">{params.contrast}%</span>
              </span>
              <input
                type="range" min={-50} max={50} step={5} value={params.contrast}
                onChange={(e) => setParams((p) => ({ ...p, contrast: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
            </label>
          </Field>

          {/* 4. 色彩量化 */}
          <Field className="mb-4 gap-3">
            <FieldLabel>4. 色彩量化与平滑</FieldLabel>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>调色板颜色数</span>
                <span className="font-mono text-primary">{params.colorCount} 色</span>
              </span>
              <input
                type="range" min={4} max={64} step={2} value={params.colorCount}
                onChange={(e) => setParams((p) => ({ ...p, colorCount: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>平滑滤波</span>
                <span className="font-mono text-primary">{params.smoothRadius}</span>
              </span>
              <input
                type="range" min={0} max={4} step={1} value={params.smoothRadius}
                onChange={(e) => setParams((p) => ({ ...p, smoothRadius: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>复古网点抖动</span>
                <span className="font-mono text-primary">{Math.round(params.ditherStrength * 100)}%</span>
              </span>
              <input
                type="range" min={0} max={100} step={5} value={params.ditherStrength * 100}
                onChange={(e) => setParams((p) => ({ ...p, ditherStrength: Number(e.target.value) / 100 }))}
                className="w-full accent-primary"
              />
            </label>
          </Field>

          {/* 5. 辅助与降噪 */}
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-semibold text-foreground">5. 辅助与降噪</div>
            <label className="flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <HoverHelp label="消除单像素杂点">
                  <p className="mb-1 font-medium">消除单像素杂点</p>
                  <p>若某像素的上下左右四邻同色且与它不同，则把该像素替换为邻色，去除孤立噪点。</p>
                </HoverHelp>
                消除单像素杂点
              </span>
              <Switch checked={params.enableDespeckle} onCheckedChange={(v) => setParams((p) => ({ ...p, enableDespeckle: v }))} size="sm" />
            </label>
          </div>

          <Button variant="outline" size="xs" className="mb-3" onClick={() => setParams({ ...DEFAULT_PREPROCESS })}>
            <RotateCcw data-icon="inline-start" />
            重置参数
          </Button>

          <Button size="lg" className="mt-auto w-full" disabled={!resultDataUrl} onClick={handleConfirm}>
            <Check data-icon="inline-start" />
            完成预处理，进入切图
          </Button>
        </div>

        {/* 右：原图 / 结果 双画布 */}
        <div className="flex min-w-0 flex-1 grid-cols-2 gap-4 p-4">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-sidebar px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>原图</span>
              {sourceDataUrl && <span className="font-mono">{params.targetW}×{params.targetH} 目标</span>}
            </div>
            <ZoomableCanvas canvasRef={srcCanvasRef}>
              <canvas
                ref={srcCanvasRef}
                className="max-h-full max-w-full rounded-md shadow-lg"
                style={{ imageRendering: "pixelated", transform: "scale(1) translate(0,0)" }}
              />
            </ZoomableCanvas>
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-sidebar px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span className="text-primary">目标像素图</span>
              <span className="font-mono">{processing ? "处理中…" : `${params.targetW}×${params.targetH}`}</span>
            </div>
            <ZoomableCanvas canvasRef={outCanvasRef}>
              <canvas
                ref={outCanvasRef}
                className="max-h-full max-w-full rounded-md shadow-lg"
                style={{ imageRendering: "pixelated", transform: "scale(1) translate(0,0)" }}
              />
            </ZoomableCanvas>
          </div>
        </div>
      </div>
    </div>
  )
}