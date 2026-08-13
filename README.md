# Autotile Studio（瓦片锻造工坊）

一个开源的桌面端瓦片地图绘制工具：参数化生成、图片导入切图、手绘编辑三合一，自动组装 16 / 47 图块集并导出标准排版 PNG Tilesheet。

基于 **Next.js + Electron** 构建，同时支持浏览器运行与桌面端打包。

## 功能特性

- **三种来源模式**
  - 参数生成：调整颜色 / 腐蚀强度 / 边缘厚度 / 边缘高光 / 随机种子，实时预览自动图块
  - 图片导入（切图）：导入源图，按网格切片并绑定槽位，拼合生成标准模板
  - 手绘：将参数生成结果「固化为像素」，编辑 5 块基础像素画布，16/47 种瓦片实时派生联动
- **两种映射表**：16 块（4 位四角双网格）、47 块（8 邻居 Blob）
- **统一导出**：标准排版（16 → 4×4 双网格，47 → 5×11 Blob），可调横向 / 纵向间距，输出 PNG
- **测试地图**：涂抹地图实时验证边缘与拐角拼合效果
- 赞助界面、悬停参数说明、使用说明文档

## 技术栈

- Next.js 16 + React 19 + TypeScript
- Zustand（状态管理）、Tailwind CSS v4
- Electron 31（桌面端打包）

## 目录结构

```
├── app/              # Next.js 页面与全局布局
├── components/
│   ├── tile-studio/  # 编辑器核心组件（模式 A/B/C、导出、说明、赞助等）
│   └── ui/           # 通用 UI 组件（按钮、对话框、提示等）
├── lib/              # 核心算法与状态（图块映射、双网格、拼接、导出）
├── electron/         # Electron 主进程与预加载脚本
├── public/           # 静态资源与图标
├── scripts/          # 辅助脚本
└── next.config.mjs   # 生产环境静态导出配置
```

## 本地开发与构建

```bash
# 安装依赖（npm）
npm install

# 开发模式（浏览器）
npm run dev

# 生产构建（Next.js 静态导出）
npm run build

# 打包 Windows 桌面应用（NSIS 安装包 + 免安装版）
npm run dist
```

打包产物位于 `dist/` 目录（`Autotile Studio Setup 0.1.0.exe` 与 `win-unpacked/`）。

## 说明

- 构建需使用 Webpack（`--webpack`），Windows 下勿用 Turbopack（os error 183）。
- 仓库不包含作者个人的微信收款码等本地资源，克隆后不影响除「赞助界面」外的任何功能。
