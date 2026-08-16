"use client"

import { useEditorStore } from "@/lib/store"
import { Wrench, ImagePlus } from "lucide-react"

/** 图片导入路径 · 步骤 ①：询问是否进入图片预处理 */
export function SlicePreprocessCheck() {
  const chooseSlicePreprocess = useEditorStore((s) => s.chooseSlicePreprocess)
  const skipSlicePreprocess = useEditorStore((s) => s.skipSlicePreprocess)

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-8">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
            <ImagePlus className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">图片导入</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            是否先对源图进行预处理（像素化缩放 / 去底 / 调色）？预处理能显著提升图块质量，也可跳过直接切图。
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={chooseSlicePreprocess}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-7 text-center transition-all hover:-translate-y-0.5 hover:border-emerald-500/60 hover:bg-emerald-500/5 shadow-sm hover:shadow-lg hover:shadow-emerald-500/10"
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 transition-transform group-hover:scale-105">
              <Wrench className="size-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">进入图片预处理</div>
              <p className="mt-1 text-xs text-muted-foreground">像素化缩放 / 去底 / 调色，再进入切图</p>
            </div>
          </button>

          <button
            type="button"
            onClick={skipSlicePreprocess}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-7 text-center transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/5 shadow-sm hover:shadow-lg"
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30 transition-transform group-hover:scale-105">
              <ImagePlus className="size-6" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">跳过，直接切图</div>
              <p className="mt-1 text-xs text-muted-foreground">源图已就绪，立即开始切块</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}