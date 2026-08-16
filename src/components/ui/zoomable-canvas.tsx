import { Children, cloneElement, useRef, useState, type ReactNode, type RefObject } from "react"

interface ZoomableCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  className?: string
  children?: ReactNode
}

/**
 * 可缩放画布容器：滚轮以鼠标位置为中心缩放、左/中键拖拽平移、双击回到 1 倍。
 * canvas 走 CSS transform，不重建像素缓冲，缩放流畅。
 */
export function ZoomableCanvas({ canvasRef, className = "", children }: ZoomableCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const view = useRef({ zoom: 1, tx: 0, ty: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const [transform, setTransform] = useState("translate(0px, 0px) scale(1)")
  const [dragging, setDragging] = useState(false)

  function apply(tx: number, ty: number, zoom: number) {
    view.current = { zoom, tx, ty }
    setTransform(`translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${zoom.toFixed(3)})`)
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const wrap = wrapRef.current
    const cv = canvasRef.current
    if (!wrap || !cv) return
    const rect = wrap.getBoundingClientRect()
    // flex 居中：画布中心即容器中心 C
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const { zoom, tx, ty } = view.current
    const factor = e.deltaY < 0 ? 1.16 : 1 / 1.16
    const nz = Math.min(32, Math.max(1, zoom * factor))
    const k = nz / zoom
    const ntx = (e.clientX - cx) - (e.clientX - cx - tx) * k
    const nty = (e.clientY - cy) - (e.clientY - cy - ty) * k
    apply(ntx, nty, nz)
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 && e.button !== 1) return
    drag.current = { x: e.clientX, y: e.clientY, tx: view.current.tx, ty: view.current.ty }
    setDragging(true)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!drag.current) return
    const d = drag.current
    const cv = canvasRef.current
    if (!cv) return
    cv.style.cursor = "grabbing"
    apply(d.tx + e.clientX - d.x, d.ty + e.clientY - d.y, view.current.zoom)
  }

  function endDrag() {
    drag.current = null
    setDragging(false)
    const cv = canvasRef.current
    if (cv) cv.style.cursor = ""
  }

  function onDoubleClick() {
    apply(0, 0, 1)
  }

  return (
    <div
      ref={wrapRef}
      className={`flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-checkerboard ${className}`}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={onDoubleClick}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      title="滚轮缩放 · 拖拽平移 · 双击复位"
    >
      {/* 把计算出的 transform 注入唯一的子元素（canvas）上，实现以鼠标为中心缩放 */}
      {Children.map(children, (child) =>
        cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
          style: {
            ...(child as React.ReactElement<{ style?: React.CSSProperties }>).props.style,
            transform,
            transformOrigin: "center",
          },
        })
      )}
    </div>
  )
}