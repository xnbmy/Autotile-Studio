"use client"

import { useEffect, useState } from "react"
import { StudioShell } from "@/components/tile-studio/studio-shell"

export default function Page() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 首屏水合锁：SSR（静态预渲染）与客户端首次渲染输出完全一致的占位，
  // 待客户端挂载完成后再渲染真实 UI，彻底消除 React #418 水合错误
  if (!mounted) {
    return <div className="h-screen w-full bg-background" />
  }

  return <StudioShell />
}
