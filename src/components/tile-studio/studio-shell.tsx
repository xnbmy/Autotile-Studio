"use client"

import { useEditorStore } from "@/lib/store"
import { WelcomeScreen } from "@/components/tile-studio/welcome-screen"
import { FlowSteps } from "@/components/tile-studio/flow-steps"
import { ProceduralConfigureScreen } from "@/components/tile-studio/procedural-configure-screen"
import { SlicePreprocessCheck } from "@/components/tile-studio/slice-preprocess-check"
import { SlicePreprocessScreen } from "@/components/tile-studio/slice-preprocess-screen"
import { SliceCutScreen } from "@/components/tile-studio/slice-cut-screen"
import { DrawScreen } from "@/components/tile-studio/draw-screen"

/**
 * 递进式流程容器：根据 store.stage 分发渲染对应界面。
 * welcome 为欢迎页（无步骤条）；其余流程步骤共享 FlowSteps 顶栏。
 */
export function StudioShell() {
  const stage = useEditorStore((s) => s.stage)

  // 欢迎页为独立布局（自带顶栏与窗口控制）
  if (stage.kind === "welcome") {
    return <WelcomeScreen />
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <FlowSteps />
      <div className="min-h-0 flex-1">
        {stage.kind === "procedural.configure" && <ProceduralConfigureScreen />}
        {stage.kind === "procedural.draw" && <DrawScreen />}
        {stage.kind === "slice.preprocess-check" && <SlicePreprocessCheck />}
        {stage.kind === "slice.preprocess" && <SlicePreprocessScreen />}
        {stage.kind === "slice.cut" && <SliceCutScreen />}
        {stage.kind === "slice.draw" && <DrawScreen />}
      </div>
    </div>
  )
}