"use client"

import { useEffect, useRef, useState } from "react"
import { useEditorStore } from "@/lib/store"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Save } from "lucide-react"
import { toast } from "sonner"

interface SaveDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** 可选：保存前派生一张缩略图（如某个瓦片），展示在欢迎页列表 */
  thumbnail?: string
}

export function SaveDialog({ open, onOpenChange, thumbnail }: SaveDialogProps) {
  const saveCurrentProject = useEditorStore((s) => s.saveCurrentProject)
  const currentProjectId = useEditorStore((s) => s.currentProjectId)
  const savedProjects = useEditorStore((s) => s.savedProjects)
  const [name, setName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      // 若当前项目之前已保存过，自动填入之前的项目名称
      const prev = savedProjects.find((m) => m.id === currentProjectId)
      setName(prev?.name ?? "")
      // 焦点延迟到打开动画后
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("请为项目命名")
      return
    }
    saveCurrentProject(trimmed, thumbnail)
    toast.success("已保存项目", { description: trimmed })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>保存当前进度</DialogTitle>
          <DialogDescription>保存 5 块基础像素与参数，可在欢迎页列表恢复。</DialogDescription>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="项目名称"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave()
          }}
        />
        <DialogFooter showCloseButton>
          <DialogClose render={<Button variant="outline" />}>
            取消
          </DialogClose>
          <Button onClick={handleSave} className="gap-1.5">
            <Save data-icon="inline-start" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}