"use client"

import { useState } from "react"
import { useEditorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { WindowControls, isTauriDesktop } from "@/components/tile-studio/window-controls"
import { HelpDialog } from "@/components/tile-studio/help-dialog"
import { SponsorDialog } from "@/components/tile-studio/sponsor-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SlidersHorizontal, ImagePlus, CircleQuestionMark, Clock, Trash2, FolderOpen } from "lucide-react"

/** 欢迎页：软件入口，仅提供「参数生成 / 图片导入」两条流程路径 + 已保存项目列表 */
export function WelcomeScreen() {
  const startProcedural = useEditorStore((s) => s.startProcedural)
  const startSlice = useEditorStore((s) => s.startSlice)
  const savedProjects = useEditorStore((s) => s.savedProjects)
  const loadSavedProject = useEditorStore((s) => s.loadSavedProject)
  const deleteSavedProject = useEditorStore((s) => s.deleteSavedProject)
  const [helpOpen, setHelpOpen] = useState(false)
  const [sponsorOpen, setSponsorOpen] = useState(false)

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* 顶部：拖拽区 + 帮助/赞助 + 窗口控制 */}
      <div
        className="flex shrink-0 items-center gap-2 border-b bg-sidebar px-4 py-2"
        {...(isTauriDesktop ? ({ "data-tauri-drag-region": true } as React.HTMLAttributes<HTMLDivElement>) : {})}
      >
        <Button
          variant="ghost"
          className="flex h-9 shrink-0 items-center gap-2 rounded-md px-2"
          onClick={() => setSponsorOpen(true)}
          aria-label="赞助作者"
          title="赞助作者"
        >
          <img src="./autotile-icon.ico" alt="" className="h-5 w-5 rounded-sm" draggable={false} />
          <span className="text-sm font-semibold tracking-tight">瓦片锻造工坊</span>
        </Button>
        {isTauriDesktop && (
          <div
            className="drag-spacer flex-1 self-stretch"
            {...({ "data-tauri-drag-region": true } as React.HTMLAttributes<HTMLDivElement>)}
          />
        )}
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setHelpOpen(true)} aria-label="使用说明" title="使用说明">
          <CircleQuestionMark className="size-4" />
        </Button>
        <WindowControls />
      </div>

      {/* 主体：上部入口卡片 + 下部已保存项目列表 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
          <div className="flex w-full max-w-3xl flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-amber-500/20 ring-1 ring-border">
                <img src="./autotile-icon.ico" alt="" className="size-10 rounded-lg" draggable={false} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">瓦片锻造工坊</h1>
              <p className="max-w-md text-sm text-muted-foreground">
                自动图块（Autotile）生成桌面应用。选择一种方式开始，生成可直接用于游戏引擎的自动图块集。
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={startProcedural}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center transition-all hover:-translate-y-0.5 hover:border-emerald-500/60 hover:bg-emerald-500/5 hover:shadow-lg hover:shadow-emerald-500/10 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 transition-transform group-hover:scale-105">
                  <SlidersHorizontal className="size-7" />
                </div>
                <div>
                  <div className="text-base font-semibold text-foreground">参数生成</div>
                  <p className="mt-1 text-xs text-muted-foreground">调整参数实时生成基础图块，再进入手绘细化</p>
                </div>
              </button>

              <button
                type="button"
                onClick={startSlice}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center transition-all hover:-translate-y-0.5 hover:border-amber-500/60 hover:bg-amber-500/5 hover:shadow-lg hover:shadow-amber-500/10 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex size-14 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 transition-transform group-hover:scale-105">
                  <ImagePlus className="size-7" />
                </div>
                <div>
                  <div className="text-base font-semibold text-foreground">图片导入</div>
                  <p className="mt-1 text-xs text-muted-foreground">导入图片进行预处理与切图，固化为像素后手绘</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* 已保存项目列表（可下滑） */}
        <div className="shrink-0 border-t bg-sidebar/40">
          <div className="flex items-center gap-2 px-6 pt-3 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
            <Clock className="size-3.5" />
            最近保存的项目
            {savedProjects.length > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground/70">{savedProjects.length}</span>
            )}
          </div>
          <ScrollArea className="h-44">
            <div className="grid grid-cols-1 gap-2 px-6 py-2 sm:grid-cols-2 lg:grid-cols-3">
              {savedProjects.length === 0 ? (
                <div className="col-span-full py-6 text-center text-xs text-muted-foreground/70">
                  暂无已保存项目。在手绘界面点击「保存」即可在此恢复。
                </div>
              ) : (
                savedProjects.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center gap-3 rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/50 hover:bg-card/80"
                  >
                    <button
                      type="button"
                      onClick={() => loadSavedProject(p.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-checkerboard">
                        {p.thumbnail ? (
                          <img src={p.thumbnail} alt="" className="size-8 rounded-sm" style={{ imageRendering: "pixelated" }} draggable={false} />
                        ) : (
                          <FolderOpen className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.mappingType} 模式 · {new Date(p.savedAt).toLocaleString()}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedProject(p.id)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="删除项目"
                      title="删除项目"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <SponsorDialog open={sponsorOpen} onOpenChange={setSponsorOpen} />
    </div>
  )
}