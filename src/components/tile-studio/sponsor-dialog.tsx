"use client"

import { invoke, isTauri } from "@tauri-apps/api/core"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

const AUTHOR_HOMEPAGE = "https://space.bilibili.com/13578876"

/** 打开作者主页：Tauri 环境走 open_url 命令（系统默认浏览器），浏览器环境回退 window.open */
async function openHomepage() {
  if (isTauri()) {
    await invoke("open_url", { url: AUTHOR_HOMEPAGE })
  } else {
    window.open(AUTHOR_HOMEPAGE, "_blank", "noreferrer")
  }
}

/** 赞助界面：作者主页跳转 */
export function SponsorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🎉 支持作者</DialogTitle>
          <DialogDescription>💖 如果这个工具对你有帮助，欢迎关注作者；有能力请充电，谢谢！</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center gap-3 py-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full max-w-56 gap-2 px-6 py-6 text-base shadow-sm transition-all hover:scale-[1.02] hover:shadow-md"
            onClick={openHomepage}
          >
            <ExternalLink data-icon="inline-start" />
            👨‍💻 作者 B 站主页
          </Button>
          <Button variant="ghost" className="px-6 text-muted-foreground" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}