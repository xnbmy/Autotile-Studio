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
      <>· <b>输入源</b>：参数生成 / 图片导入（切图）两种来源，在<b>左栏顶部</b>切换；中间画布随时可直接手绘，共用同一套 5 块基础图块。</>,
      <>· <b>映射表</b>：16 块（4 位四角双网格）或 47 块（8 邻居 Blob），决定瓦片拼合算法。</>,
      <>· <b>图块大小</b>：设置输出瓦片的像素尺寸。自动切片规则：16 块 → 图块大小，47 块 → 固定 32px。</>,
      <>· <b>导出按钮</b>：弹出系统「另存为」对话框，由你选择目标文件夹与文件名，按标准排版导出 PNG。</>,
      <>· <b>问号图标</b>：打开本说明文档。</>,
    ],
  },
  {
    icon: <Sparkles className="size-4" />,
    title: "参数生成",
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
    lines: [
      <>· 左侧参数面板调整<b>颜色 / 腐蚀强度 / 边缘厚度 / 边缘高光 / 随机种子</b>，悬停标签可查看各参数含义。</>,
      <>· 顶部<b>实时预览</b>随参数即时刷新：16 块显示全部 4×4 双网格，47 块显示 3×3 拼接示例。</>,
      <>· 参数调整<b>实时写入</b>中间 5 块基础画布；若画布含手绘 / 切片修改，会先弹出确认条（确认覆写 / 锁定手绘 / 还原参数）。</>,
    ],
  },
  {
    icon: <Image className="size-4" />,
    title: "图片导入 / 切图",
    accent: "text-sky-500",
    bg: "bg-sky-500/10",
    lines: [
      <>· 左栏顶部「<b>导入图片 / 更换图片</b>」加载源图；也可直接把图片文件<b>拖拽到选块区域</b>导入。</>,
      <>· 设置<b>切块大小</b>（可手动覆盖自动推算值），下方为<b>内联拾取网格</b>并占满左栏剩余区域。</>,
      <>· 在网格上点选方块立即绑定当前槽位，自动跳到下一空槽；<b>滚轮缩放</b>、<b>Shift / 中键拖拽</b>平移。已绑定槽位会着色高亮。</>,
      <>· 槽位<b>横向按钮</b>点击切换当前绑定的槽位（已绑定槽带绿点）。槽位数量：16 块 / 47 模式均为 5 块基础槽（16：外角·内角·上边·全图·空白；47：外角·内角·上边缘·全实·空背景）。</>,
      <>· 「<b>固化为像素</b>」把绑定的 5 块素材写入中间画布（16 / 47 模式均可用），固化后停留本页，可继续手绘微调。</>,
      <>· 右侧「测试地图」随时涂抹，实时验证图块边缘与拐角拼合是否自然。</>,
    ],
  },
  {
    icon: <Paintbrush className="size-4" />,
    title: "手绘微调",
    accent: "text-purple-500",
    bg: "bg-purple-500/10",
    lines: [
      <>· 绘制工具栏位于<b>中间画布顶部</b>：<b>铅笔 / 橡皮 / 吸管 / 油漆桶 / 矩形 / 直线</b>，按像素写入基础块。</>,
      <>· 中间画布随时可直接手绘 5 块基础像素（凸 / 实 / 空 / 凹 / 边），无需切换模式。</>,
      <>· 所有 16/47 种瓦片由 5 块基础块实时派生，改一个像素，总览与测试地图全图联动。</>,
      <>· 开启「∞ 通透」时越界像素自动回绕，可绘制无缝拼接纹理。</>,
    ],
  },
  {
    icon: <MousePointer2 className="size-4" />,
    title: "16 / 47 总览（单格微调）",
    accent: "text-violet-500",
    bg: "bg-violet-500/10",
    lines: [
      <>· 中栏下方显示全部派生瓦片，点击任意格子即可选中并高亮。</>,
      <>· <b>选择模式</b>：点击只选中高亮、不绘制；<b>编辑模式</b>：点击即用当前工具直接绘制该格。</>,
      <>· 编辑时鼠标光标为「<b>笔刷方块 + 十字准星</b>」：笔刷随笔刷大小与缩放实时变化，十字准星固定尺寸不随地图缩放，格子外也始终显示，便于准确定位。</>,
    ],
  },
  {
    icon: <Download className="size-4" />,
    title: "导出",
    accent: "text-orange-500",
    bg: "bg-orange-500/10",
    lines: [
      <>· 点击右上角「导出」按钮，弹出<b>系统「另存为」对话框</b>，由你选择目标文件夹与文件名，确认后写入 PNG。</>,
      <>· 统一按<b>标准排版</b>导出：16 块 → 4×4 双网格排列，47 块 → 5×11 blob 排列。</>,
      <>· 可分别设置<b>横向间距 / 纵向间距</b>（像素），用于引擎导入时留出取样间隔。</>,
      <>· 参数生成 / 手绘微调 / 切图槽位（含 47 完整 14 槽）的导出均走同一个对话框，结果与预览一致。</>,
    ],
  },
  {
    icon: <Settings2 className="size-4" />,
    title: "通用操作",
    accent: "text-slate-400",
    bg: "bg-slate-400/10",
    lines: [
      <>· 画布<b>滚轮缩放</b>（以鼠标指针为中心），<b>中键 / 右键拖拽</b>平移。</>,
      <>· 绘制工具栏位于<b>中栏顶部</b>，随中栏横向伸缩；左 / 右面板顶到与工具栏对齐，充分利用屏幕。</>,
      <>· <b>分隔条</b>可拖拽调整三栏宽度，悬停出现折叠按钮，双击恢复默认布局（自动记忆）。</>,
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
