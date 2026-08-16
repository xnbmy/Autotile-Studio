"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Settings2, Sparkles, Image, Paintbrush, Download, MousePointer2, Home, Wrench, Save } from "lucide-react"

interface SectionDef {
  icon: React.ReactNode
  title: string
  accent: string
  bg: string
  lines: React.ReactNode[]
}

const SECTIONS: SectionDef[] = [
  {
    icon: <Home className="size-4" />,
    title: "欢迎页与流程",
    accent: "text-amber-500",
    bg: "bg-amber-500/10",
    lines: [
      <>· 启动软件进入<b>欢迎页</b>，提供两个入口：<b>参数生成</b> 与 <b>图片导入</b>，选择后进入对应流程。</>,
      <>· 流程采用<b>递进式</b>：每一步只展示当前任务界面，顶部步骤条显示当前进度。</>,
      <>· <b>重新开始</b>：返回欢迎页并清空当前工作。<b>返回</b>：回到上一步修改参数或切片。</>,
      <>· <b>左上角图标</b>：点击打开「赞助作者」界面（微信扫码 / 作者 B 站主页）；<b>问号图标</b>：打开本说明文档。</>,
    ],
  },
  {
    icon: <Sparkles className="size-4" />,
    title: "参数生成",
    accent: "text-emerald-500",
    bg: "bg-emerald-500/10",
    lines: [
      <>· 欢迎页点「<b>参数生成</b>」进入参数生成与预览界面。</>,
      <>· 顶部设置<b>映射表</b>（16 / 47 块）与<b>图块大小</b>；左侧参数面板调整<b>颜色 / 腐蚀强度 / 边缘厚度 / 边缘高光 / 随机种子</b>，右侧大图实时预览。</>,
      <>· 调好参数后点击「<b>开始</b>」固化当前参数，进入手绘界面。</>,
      <>· 若画布含手绘修改后返回并调参，会弹出确认条（确认覆写 / 锁定手绘 / 还原参数）保护你的手绘。</>,
    ],
  },
  {
    icon: <Wrench className="size-4" />,
    title: "图片导入 · 预处理",
    accent: "text-rose-500",
    bg: "bg-rose-500/10",
    lines: [
      <>· 欢迎页点「<b>图片导入</b>」后先询问是否进入图片预处理。</>,
      <>· 选择「<b>进入预处理</b>」打开像素处理界面：设置目标分辨率、暗部提亮 / 对比度、调色板颜色数、平滑滤波、复古网点抖动等，右侧实时预览结果。</>,
      <>· 预处理基于「中值切割自适应调色板 + 块平均重采样 + 亮度优先感知匹配」算法，将图片像素化为目标尺寸。</>,
      <>· 选择「<b>跳过，直接切图</b>」则直接进入切图界面。</>,
    ],
  },
  {
    icon: <Image className="size-4" />,
    title: "图片导入 · 切图",
    accent: "text-sky-500",
    bg: "bg-sky-500/10",
    lines: [
      <>· 「<b>导入图片 / 更换图片</b>」加载源图；也可直接把图片文件<b>拖拽到选块区域</b>导入。</>,
      <>· 设置<b>切块大小</b>（可手动覆盖自动推算值），下方为<b>内联拾取网格</b>并占满剩余区域。</>,
      <>· 点选网格方块立即绑定当前槽位，自动跳到下一空槽；<b>滚轮缩放</b>、<b>Shift / 中键拖拽</b>平移。已绑定槽位着色高亮。</>,
      <>· 槽位<b>横向按钮</b>切换当前绑定槽位（16 / 47 模式均为 5 块基础槽）。</>,
      <>· 「<b>固化为像素</b>」把绑定的 5 块素材写入基础画布，并自动进入手绘界面。</>,
    ],
  },
  {
    icon: <Paintbrush className="size-4" />,
    title: "手绘微调",
    accent: "text-purple-500",
    bg: "bg-purple-500/10",
    lines: [
      <>· 参数生成与图片导入最终都汇入同一<b>手绘界面</b>，编辑 5 块基础像素。</>,
      <>· 绘制工具栏位于<b>画布顶部</b>：<b>铅笔 / 橡皮 / 吸管 / 油漆桶 / 矩形 / 直线</b>，按像素写入基础块。</>,
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
      <>· 手绘界面下方显示全部派生瓦片，点击任意格子即可选中并高亮。</>,
      <>· <b>选择模式</b>：点击只选中高亮、不绘制；<b>编辑模式</b>：点击即用当前工具直接绘制该格。</>,
      <>· 编辑时鼠标光标为「<b>笔刷方块 + 十字准星</b>」：笔刷随笔刷大小与缩放实时变化，十字准星固定尺寸不随地图缩放，格子外也始终显示。</>,
    ],
  },
  {
    icon: <Download className="size-4" />,
    title: "导出",
    accent: "text-orange-500",
    bg: "bg-orange-500/10",
    lines: [
      <>· 手绘界面右上角「导出」按钮，弹出<b>系统「另存为」对话框</b>，由你选择目标文件夹与文件名，确认后写入 PNG。</>,
      <>· 统一按<b>标准排版</b>导出：16 块 → 4×4 双网格排列，47 块 → 5×11 blob 排列。</>,
      <>· 可分别设置<b>横向间距 / 纵向间距</b>（像素），用于引擎导入时留出取样间隔。</>,
      <>· 参数生成 / 手绘微调 / 切图槽位的导出均走同一个对话框，结果与预览一致。</>,
    ],
  },
  {
    icon: <Save className="size-4" />,
    title: "项目保存 / 恢复",
    accent: "text-cyan-500",
    bg: "bg-cyan-500/10",
    lines: [
      <>· 手绘界面右上角「<b>保存</b>」将当前进度持久化到本机，包括 <b>5 块基础像素、参数、单格微调</b>与<b>测试地图涂抹状态</b>。</>,
      <>· 保存时<b>填写项目名称</b>；若该项目之前已保存过，会自动填入之前的名称并更新原项目记录（不重复创建）。</>,
      <>· 欢迎页底部「<b>最近保存的项目</b>」列表可下滑查看，<b>点击任意项目</b>即可恢复并重新进入手绘界面，继续编辑。</>,
      <>· 列表项悬停出现<b>删除</b>按钮，可移除不再需要的存档。</>,
    ],
  },
  {
    icon: <Settings2 className="size-4" />,
    title: "通用操作",
    accent: "text-slate-400",
    bg: "bg-slate-400/10",
    lines: [
      <>· 画布<b>滚轮缩放</b>（以鼠标指针为中心），<b>中键 / 右键拖拽</b>平移。</>,
      <>· 预处理界面与切图界面均支持<b>像素级</b>渲染，无抗锯齿边缘。</>,
      <>· 流程两步之间可点顶部「<b>返回</b>」回到上一步调整，点「<b>重新开始</b>」清空全部工作。</>,
      <>· 左上角图标点击可打开赞助界面；参数 / 选项标签悬停可查看对应说明。</>,
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
