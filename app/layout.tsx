import type { Metadata, Viewport } from 'next'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'TileForge — 瓦片地图绘制工具',
  description: '桌面端瓦片地图极简绘制工具：参数化生成、图片导入、双图拼接，自动组装图块集并导出兼容主流游戏引擎的 PNG Tilesheet。',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: './icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: './icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: './icon.svg', type: 'image/svg+xml' },
    ],
    apple: './apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#292115',
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh" className="dark bg-background">
      <body className="antialiased font-sans">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  )
}
