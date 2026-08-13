"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Settings2, Sparkles, Image, Paintbrush, Download, MousePointer2 } from "lucide-react"

interface SectionDef {
  icon: React.ReactNode
  title: string
  accent: string
  bg: string
  lines: React.ReactNode[]
}

const SECTIONS: SectionDef[] = [
  {
    icon: <Settings2 className="size-4" />,
    title: "顶部工具栏",
    accent: "text-amber-500",
    bg: "bg-amber-500/10",
    lines: [
      <>· <b>左上角图标</b>：点击打开「赞助作者」界面（微信扫码 / 作者 B 站主页）。</>,
      <>· <b>来源模式</b>：程序生成 / 图片导入（切图）/ 手绘，三种入口共用同一套图块数据。</>,
      <>· <b>映射表</b>：16 块（4 位四角双网格）或 47 块（8 邻居 Blob），决定瓦片拼合算法。</>,
      <>· <b>图块大小</b>：设置输出瓦片的像素尺寸（悬停标签可查看自动切片规则）。</>,
      <>· <b>导出按钮</b>：打开导出对话框，按标准排版导出 PNG，可调整横/纵向图块间距。</>,
      <>· <b>问号图标</b>：打开本说明文档。</>,
    ],
  },
  {
    icon: <Sparkles className="size-4" />,
    title: "程序生成（模式 A）",
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
    lines: [
      <>· 左侧参数面板调整<b>颜色 / 腐蚀强度 / 边缘厚度 / 边缘高光 / 随机种子</b>，悬停标签可查看各参数含义。</>,
      <>· 顶部<b>实时预览</b>随参数即时刷新：16 块显示全部 4×4 双网格，47 块显示 3×3 拼接示例。</>,
      <>· 点击「固化为像素」：把当前参数生成的图块写入 5 块基础像素画布，并切换到手绘模式。</>,
      <>· 中间画布可用<b>画笔 / 橡皮 / 油漆桶 / 直线 / 圆形 / 平移</b>工具涂抹，实时查看拼合效果。</>,
    ],
  },
  {
    icon: <Image className="size-4" />,
    title: "图片导入 / 切图（模式 B）",
    accent: "text-sky-500",
    bg: "bg-sky-500/10",
    lines: [
      <>· 「导入图片」加载源图，设置<b>切片大小</b>（可手动覆盖自动推算值）。</>,
      <>· 选择槽位后到中间预览区点选方块完成绑定：47 块共 13 槽（可开启「简化槽位」只绑 5 块）。</>,
      <>· 全部槽位绑定后点击「生成模板」，在「生成模板」页查看标准排列（16：4×4，47：5×11）。</>,
      <>· 「测试地图」页可涂抹，实时验证图块边缘与拐角拼合是否自然。</>,
    ],
  },
  {
    icon: <Paintbrush className="size-4" />,
    title: "手绘（模式 C）",
    accent: "text-purple-500",
    bg: "bg-purple-500/10",
    lines: [
      <>· 由「固化为像素」进入，或直接切到手绘模式：编辑 5 块基础像素（凸 / 实 / 空 / 凹 / 边）。</>,
      <>· 工具：<b>铅笔 / 橡皮 / 吸管 / 油漆桶 / 矩形 / 直线</b>，按像素写入基础块。</>,
      <>· 所有 16/47 种瓦片由 5 块基础块实时派生，改一个像素，总览与测试地图全图联动。</>,
      <>· 开启「∞ 通透」时越界像素自动回绕，可绘制无缝拼接纹理。</>,
    ],
  },
  {
    icon: <Download className="size-4" />,
    title: "导出",
    accent: "text-orange-500",
    bg: "bg-orange-500/10",
    lines: [
      <>· 点击右上角「导出」按钮，统一按<b>标准排版</b>导出 PNG：16 块 → 4×4 双网格排列，47 块 → 5×11 blob 排列。</>,
      <>· 可分别设置<b>横向间距 / 纵向间距</b>（像素），用于引擎导入时留出取样间隔。</>,
      <>· 三种模式（程序生成 / 手绘 / 切图）的导出均走同一个对话框，结果与预览一致。</>,
    ],
  },
  {
    icon: <MousePointer2 className="size-4" />,
    title: "通用操作",
    accent: "text-slate-400",
    bg: "bg-slate-400/10",
    lines: [
      <>· 画布<b>滚轮缩放</b>（以鼠标指针为中心），<b>中键 / 右键拖拽</b>平移。</>,
      <>· 左上角图标点击可打开赞助界面；参数标签悬停可查看对应说明。</>,
    ],
  },
]

/** 使用说明文档：软件所有操作及相关说明 */
export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-amber-500/15 via-transparent to-emerald-500/10 p-3 ring-1 ring-border">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-lg text-white shadow-md">
              📖
            </span>
            <div>
              <DialogTitle className="text-base">使用说明</DialogTitle>
              <DialogDescription>瓦片锻造工坊 · 所有操作及说明文档</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {SECTIONS.map((s) => (
            <div key={s.title} className="rounded-xl border border-border bg-card/40 p-3 transition-colors hover:bg-card/70">
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex size-7 items-center justify-center rounded-lg ${s.bg} ${s.accent}`}>{s.icon}</span>
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
              </div>
              <ul className="space-y-1.5 pl-1">
                {s.lines.map((line, i) => (
                  <li key={i} className="text-[13px] leading-relaxed text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
