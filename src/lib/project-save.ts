"use client"

import type { CanvasView, GenParams, MapView, MappingType, SourceMode } from "./types"
import { emptySlotsForType } from "./quadrant-stitch"

// ── 已保存项目持久化（localStorage）──────────────────────────────────────
// 手绘/切片路径的当前进度会被序列化为 ProjectData 持久化到本机，
// 欢迎页下方列表可点击恢复并重新进入手绘界面。

export interface SavedProjectMeta {
  id: string
  name: string
  savedAt: number
  mappingType: MappingType
  thumbnail: string // 一张基础块的缩略图 dataURL
}

export interface ProjectData {
  id: string
  name: string
  savedAt: number
  sourceMode: SourceMode
  mappingType: MappingType
  tileSize: number
  genParams: GenParams
  baseDirty: boolean
  thumbnail: string // 列表缩略图 dataURL（优先取调用方提供的派生瓦片）
  // canvas → PNG dataURL
  baseCanvases: Record<string, string>
  overrides: Record<string, string>
  // 切片路径遗留（供导出时拼合）
  modeBImage: string | null
  modeBImageSize: { w: number; h: number } | null
  modeBGridSize: number
  modeBSlots: Record<string, string | null>
  centerView: CanvasView
  testView: MapView
  // 测试地图涂抹的格子集合（稀疏坐标 "x,y"），随项目一并保存/恢复
  testFill: string[]
}

const META_KEY = "autotile.savedProjects.meta"
const MAX_PROJECTS = 20

function dataKey(id: string) {
  return `autotile.savedProjects.data.${id}`
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function listSavedProjects(): SavedProjectMeta[] {
  if (typeof window === "undefined") return []
  return safeParse<SavedProjectMeta[]>(window.localStorage.getItem(META_KEY)) ?? []
}

export function readProjectData(id: string): ProjectData | null {
  if (typeof window === "undefined") return null
  const data = safeParse<ProjectData>(window.localStorage.getItem(dataKey(id)))
  if (data) data.modeBSlots = data.modeBSlots ?? emptySlotsForType(data.mappingType)
  return data
}

export function writeProjectData(data: ProjectData): void {
  if (typeof window === "undefined") return
  const metas = listSavedProjects().filter((m) => m.id !== data.id)
  const meta: SavedProjectMeta = {
    id: data.id,
    name: data.name,
    savedAt: data.savedAt,
    mappingType: data.mappingType,
    thumbnail: data.thumbnail,
  }
  metas.unshift(meta)
  window.localStorage.setItem(META_KEY, JSON.stringify(metas.slice(0, MAX_PROJECTS)))
  window.localStorage.setItem(dataKey(data.id), JSON.stringify(data))
}

export function deleteProjectData(id: string): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(dataKey(id))
  window.localStorage.setItem(
    META_KEY,
    JSON.stringify(listSavedProjects().filter((m) => m.id !== id))
  )
}

function canvasToDataURL(c: HTMLCanvasElement): string {
  return c.toDataURL("image/png")
}

function dataURLToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement("canvas")
      cv.width = img.width
      cv.height = img.height
      const ctx = cv.getContext("2d", { willReadFrequently: true })
      if (!ctx) {
        reject(new Error("无法创建画布"))
        return
      }
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
      resolve(cv)
    }
    img.onerror = () => reject(new Error("图片解码失败"))
    img.src = dataUrl
  })
}

/** 把一组 canvas 序列化为 dataURL 记录 */
export function serializeCanvases(canvases: Record<string, HTMLCanvasElement>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(canvases)) out[k] = canvasToDataURL(v)
  return out
}

/** 把 dataURL 记录反序列化回 canvas 记录 */
export async function deserializeCanvases(
  data: Record<string, string>
): Promise<Record<string, HTMLCanvasElement>> {
  const out: Record<string, HTMLCanvasElement> = {}
  for (const [k, v] of Object.entries(data)) out[k] = await dataURLToCanvas(v)
  return out
}