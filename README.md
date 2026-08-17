# Autotile Studio（瓦片锻造工坊）

> 自动图块（Autotile / Tileset）生成桌面应用 —— 参数化生成、图片导入切图、手绘微调统一工作台，自动组装 **16 / 47** 图块集并导出标准排版 PNG 图集。

基于 **Vite + React 19 + TypeScript + Zustand + Tailwind v4 + Tauri v2** 构建的桌面端工具，安装包体积小（约 2MB）、内存占用低、启动快，可直接用于游戏引擎的自动图块素材制作。

---

## 快速开始

欢迎页提供两条递进式流程，最终汇入同一手绘界面完成微调与导出：

```
欢迎页
 ├─ 参数生成 ──► 参数生成与预览 ──► 手绘微调 ──► 导出
 └─ 图片导入 ──► 是否预处理 ──► 像素处理 ──► 切图 ──► 手绘微调 ──► 导出
```

| 流程 | 说明 |
| --- | --- |
| **参数生成** | 调整映射表 / 图块大小 / 颜色 / 腐蚀 / 边缘等参数，右侧实时预览，点「开始」固化为基础像素 |
| **图片导入** | 可选进入像素预处理（自适应调色板 + 感知匹配），再切图把 5 块素材一键固化为像素 |
| **手绘微调** | 编辑 5 块基础像素，所有瓦片实时派生，可在 16/47 总览单格微调，右侧测试地图验证拼合 |
| **导出** | 系统「另存为」对话框选路径，按标准排版输出 PNG 图集 |

---

## 功能特性

- **递进式流程**
  - 欢迎页两个入口（参数生成 / 图片导入），随流程逐步进入对应界面，顶部步骤条显示进度
  - 「返回」回到上一步调整；「重新开始」清空并回到欢迎页
- **参数化生成**：实时调整参数（颜色 / 腐蚀强度 / 边缘厚度 / 边缘高光 / 随机种子等），一键固化为基础块
- **图片预处理**：目标分辨率可调，内置暗部提亮 / 对比度 / 调色板颜色数 / 平滑滤波 / 复古网点抖动；基于「中值切割自适应调色板 + 块平均重采样 + 亮度优先感知匹配」算法像素化
- **切片拾取内联网格**：源图上点选即绑定槽位（自动跳下一空槽），滚轮缩放 / Shift·中键平移，支持直接拖拽图片导入
- **固化为像素**：切图素材（16 / 47 均为 5 块基础槽）一键写入画布继续手绘，固化后停留切图页
- **手绘微调**：铅笔 / 橡皮 / 吸管 / 油漆桶 / 矩形 / 直线，按像素写入；「∞ 通透」绘制无缝拼接纹理
- **切图对齐微调**（仅图片导入路径）：开启后点击选中一块基础块，用方向键移动它在源图中的裁切选框（可越界并对侧环形回绕取样），实时从源图重切该块像素以对齐素材边界
- **16/47 总览单格微调**：全部派生瓦片一览，选择 / 编辑两种模式，编辑时显示「笔刷方块 + 十字准星」光标
- **两种映射表**：16 块（4 位四角双网格）、47 块（8 邻居 Blob），均标准排版；47 块采用「Fragment + 错位取景」拼合算法（配方数据见 `blob47-recipes.json`），外角 / 内角以素材旋转 + 镜像对齐方向
- **项目保存 / 恢复**：手绘界面「保存」将基础像素、参数、单格微调与测试地图涂抹状态一并持久化到本机；重复保存自动沿用原项目名称并更新原记录；欢迎页底部「最近保存的项目」列表点击即可恢复继续编辑，支持删除
- **统一导出**：标准排版（16 → 4×4 双网格，47 → 5×11 Blob），可调横向 / 纵向间距；系统「另存为」对话框选目标文件夹输出 PNG
- **测试地图**：涂抹地图实时验证边缘与拐角拼合效果，改一个像素全图联动
- **自定义窗口标题栏**：拖拽移动 / 双击最大化 / 最小化 / 最大化 / 关闭
- 使用说明文档（含对齐微调说明）、赞助界面、悬停参数说明

---

## 技术栈

- **前端**：Vite + React 19 + TypeScript
- **状态**：Zustand
- **样式**：Tailwind CSS v4、@base-ui/react 组件
- **桌面端**：Tauri v2（Rust 后端，含系统「另存为」对话框命令）

---

## 目录结构

```
├── src/
│   ├── components/
│   │   ├── tile-studio/        # 流程与编辑器核心组件
│   │   │   ├── studio-shell.tsx        # 流程容器（按 stage 分发界面）
│   │   │   ├── welcome-screen.tsx      # 欢迎页（入口 + 已保存项目列表）
│   │   │   ├── flow-steps.tsx          # 顶部步骤条
│   │   │   ├── procedural-configure-screen.tsx  # 参数生成与预览
│   │   │   ├── slice-preprocess-check.tsx       # 预处理询问
│   │   │   ├── slice-preprocess-screen.tsx      # 像素预处理
│   │   │   ├── slice-cut-screen.tsx             # 切图
│   │   │   ├── draw-screen.tsx                  # 手绘界面（左基础块/总览，右测试地图）
│   │   │   ├── save-dialog.tsx / export-dialog.tsx / help-dialog.tsx / sponsor-dialog.tsx
│   │   │   ├── mode-c-canvas.tsx / mode-c-overview.tsx / mode-c-test-map.tsx
│   │   │   ├── mode-a-panel.tsx / mode-a-preview.tsx / mode-b-panel.tsx
│   │   │   ├── slice-picker-inline.tsx / draw-toolbar.tsx / window-controls.tsx
│   │   └── ui/                 # 通用 UI 组件（button、dialog、slider、zoomable-canvas 等）
│   ├── lib/                    # 核心算法与状态
│   │   ├── store.ts                    # Zustand 全局状态（阶段状态机 / 派生 / 撤销栈 / 项目保存）
│   │   ├── tile-mapping.ts             # mask 布局表（47 / 16 标准排版）
│   │   ├── quadrant-stitch.ts          # 47/16 派生核心
│   │   ├── dual-grid.ts                # 16 双网格圆弧渲染
│   │   ├── texture-generator.ts        # 47 blob 纹理渲染
│   │   ├── asset-factory.ts / tileset-composer.ts / slice-freeze.ts / export-presets.ts
│   │   ├── pixel-preprocess.ts         # 图像像素化预处理
│   │   ├── project-save.ts             # 项目持久化（localStorage）
│   │   └── canvas-geometry.ts / prng.ts / utils.ts
│   ├── App.tsx                # 应用根组件
│   ├── main.tsx               # 入口
│   └── index.css              # 全局样式与 Tailwind 主题
├── src-tauri/                 # Tauri 桌面端（配置、Rust 主进程、权限、图标）
├── public/                    # 静态资源与图标
├── index.html                 # Vite 入口 HTML
└── vite.config.ts             # Vite 配置
```

---

## 本地开发与构建

```bash
# 安装依赖（pnpm）
pnpm install

# 开发模式（浏览器，HMR）
pnpm dev

# 前端生产构建（tsc + vite build）
pnpm build

# 打包 Windows 桌面应用（NSIS .exe + MSI）
pnpm tauri build
```

打包产物位于 `src-tauri/target/release/bundle/` 目录（`nsis/` 与 `msi/` 子目录）。

### 环境要求

- **Node.js** 与 **pnpm**（建议 pnpm 11+）
- **Rust 工具链**（rustup）：首次 `pnpm tauri build` 需要，并可能需配置代理以下载 WiX / NSIS 工具链（缓存于 `%LOCALAPPDATA%\tauri`）

---

## 更新记录

> 近期主要更新的内容汇总（当前版本 v0.2.7，版本号见 `package.json` 与 `src-tauri/tauri.conf.json`）。

### v0.2.7 · 2026-08-17
- **使用说明入口全界面可用**：顶栏「问号」入口原本仅欢迎页可见，现已扩展到所有流程界面；帮助文档同步补充了对齐微调说明。
- **赞助界面调整**：说明改为居中的两排小字，关闭按钮改为橙色边框。
- **47 图块新算法**：改由「Fragment + 错位取景」从 5 素材拼合 47 瓦片（配方数据见 `blob47-recipes.json`），外角水平镜像 / 内角垂直镜像以对齐素材方向；统一了手绘派生与直接导出的数据链路。
- **切图对齐微调**：手绘界面新增「对齐微调」开关（仅图片导入路径生效），开启后点击选中基础块，用方向键移动它在源图中的裁切选框并实时重切该块像素以对齐边界；选框可越界，从对侧环形回绕取样。
- **16 双网格预览**：实时预览的对角瓦片（6 / 9）可独立画带（`diagConnect`），库资产导出仍为 S 形带，避免预览与导出的对角带连接不一致。
- **工具脚本**：新增 `scripts/diag16-check.mjs` 用于 16 双网格结果的快速校验。

---

## 发布与更新流程

**更新方式**：当前版本未接入自动更新（未启用 `tauri-plugin-updater`），用户需手动下载新版安装包并覆盖安装；Windows 安装模式为 `perMachine`（NSIS）。

**发布新版步骤（开发者）**
1. **升版本号**：同步修改 `package.json` 与 `src-tauri/tauri.conf.json` 的 `version`（如 `0.2.7`），两处保持一致。
2. **本地打包**：`pnpm tauri build` —— 自动依次执行 `pnpm build`（`tsc -b && vite build`）与 Rust release 编译，产出 NSIS（.exe）与 MSI 安装包至 `src-tauri/target/release/bundle/`。
3. **提交与推送**：`git add <改动>` → `git commit` → `git push origin main`；如需版本标记可打 tag（如 `v0.2.7`）。
4. **分发**：将 `bundle/nsis/` 与 `bundle/msi/` 中对应版本号的安装包发布给用户（建议同时提供 NSIS 与 MSI）。

**用户更新需知**
- 升级前请**退出正在运行的 Autotile Studio**——存在旧进程时安装可能被占用而未真正覆盖，导致运行时仍是旧版本（历史已验证此问题）。
- 已保存项目存储于本机 `localStorage`，覆盖安装后可保留。
- 网络限制：若本机需代理才能访问 GitHub，请在推送时为 git 配置代理，例如 `git -c http.proxy=http://127.0.0.1:7890 push origin main`。

---

## 说明

- 「支持作者」界面仅含作者主页跳转按钮，不含任何收款信息或本地资源。
- 项目数据（已保存项目）存储在浏览器 / WebView 的 `localStorage` 中。