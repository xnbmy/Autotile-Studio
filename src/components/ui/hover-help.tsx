"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * 鼠标悬停跟随提示：悬停在标签文字上时，在鼠标旁弹出小窗口显示说明。
 * 用法：<HoverHelp label="图块大小">说明内容</HoverHelp>
 */
export function HoverHelp({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // 用实测尺寸把窗口夹在视口内，避免超出屏幕边缘
  useEffect(() => {
    if (!pos) return
    const el = boxRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let x = pos.x + 12
    let y = pos.y + 14
    if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8
    el.style.left = `${Math.max(8, x)}px`
    el.style.top = `${Math.max(8, y)}px`
  }, [pos])

  return (
    <span
      className="inline-flex cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2"
      onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {label}
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={boxRef}
            className="pointer-events-none fixed z-[100] max-w-[280px] rounded-md border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl"
            style={{ left: pos.x + 12, top: pos.y + 14 }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  )
}
