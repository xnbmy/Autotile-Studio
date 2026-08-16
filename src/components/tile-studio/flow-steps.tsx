"use client"

import { useEditorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { WindowControls, isTauriDesktop } from "@/components/tile-studio/window-controls"
import { ChevronLeft, Home } from "lucide-react"
import type { Stage } from "@/lib/types"

/** 步骤条面板：根据当前 stage 渲染路径名与步骤，提供返回 / 重新开始 */
export function FlowSteps() {
  const stage = useEditorStore((s) => s.stage)
  const goTo = useEditorStore((s) => s.goTo)
  const restartToWelcome = useEditorStore((s) => s.restartToWelcome)

  const isSlice = stage.kind.startsWith("slice")
  const isProcedural = stage.kind.startsWith("procedural")

  // 返回目标：手绘 → 上游固化点；切图 → 询问预处理；预处理 → 询问预处理
  let backTarget: Stage | null = null
  if (stage.kind === "procedural.draw") backTarget = { kind: "procedural.configure" }
  else if (stage.kind === "slice.preprocess") backTarget = { kind: "slice.preprocess-check" }
  else if (stage.kind === "slice.cut") backTarget = { kind: "slice.preprocess-check" }
  else if (stage.kind === "slice.draw") backTarget = { kind: "slice.cut" }

  const title = isProcedural
    ? "参数生成"
    : isSlice
      ? "图片导入"
      : ""

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b bg-sidebar px-3 py-1.5"
      {...(isTauriDesktop ? ({ "data-tauri-drag-region": true } as React.HTMLAttributes<HTMLDivElement>) : {})}
    >
      <Button variant="ghost" size="sm" onClick={restartToWelcome} title="返回欢迎页（清空当前工作）" aria-label="返回欢迎页">
        <Home data-icon="inline-start" />
        重新开始
      </Button>
      {backTarget && (
        <Button variant="outline" size="sm" onClick={() => goTo(backTarget!)} title="返回上一步" aria-label="返回上一步">
          <ChevronLeft data-icon="inline-start" />
          返回
        </Button>
      )}
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{stepLabel(stage)}</span>
      {isTauriDesktop && (
        <div
          className="drag-spacer flex-1 self-stretch"
          {...({ "data-tauri-drag-region": true } as React.HTMLAttributes<HTMLDivElement>)}
        />
      )}
      <WindowControls />
    </div>
  )
}

function stepLabel(stage: Stage): string {
  switch (stage.kind) {
    case "welcome":
      return ""
    case "procedural.configure":
      return "① 参数生成与预览"
    case "procedural.draw":
      return "② 手绘细化"
    case "slice.preprocess-check":
      return "① 是否预处理"
    case "slice.preprocess":
      return "② 像素处理"
    case "slice.cut":
      return "③ 切图"
    case "slice.draw":
      return "④ 手绘细化"
  }
}