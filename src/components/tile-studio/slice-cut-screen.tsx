"use client"

import { useEditorStore } from "@/lib/store"
import { ModeBPanel } from "@/components/tile-studio/mode-b-panel"

/** 图片导入路径 · 步骤 ③：切图界面（复用 ModeBPanel，固化为像素后自动进入手绘） */
export function SliceCutScreen() {
  const stage = useEditorStore((s) => s.stage)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <ModeBPanel key={`slice-cut-${stage.kind}`} />
    </div>
  )
}