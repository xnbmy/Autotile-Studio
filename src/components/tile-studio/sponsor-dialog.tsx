"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

const AUTHOR_HOMEPAGE = "https://space.bilibili.com/13578876"

/** 赞助界面：微信收款码 + 作者主页链接 */
export function SponsorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>🎉 赞助作者</DialogTitle>
          <DialogDescription>💖 如果这个工具对你有帮助，欢迎扫码支持一下，谢谢！</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2">
          <img
            src="./wechat-pay.png"
            alt="微信收款码"
            className="h-64 w-64 rounded-md object-contain bg-checkerboard ring-1 ring-border"
            draggable={false}
          />
          <span className="text-xs text-muted-foreground">🙏 微信扫码赞助</span>
        </div>

        <DialogFooter>
          <a href={AUTHOR_HOMEPAGE} target="_blank" rel="noreferrer">
            <Button variant="outline">
              <ExternalLink data-icon="inline-start" />
              👨‍💻 作者 B 站主页
            </Button>
          </a>
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
