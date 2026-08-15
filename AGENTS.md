# AGENTS.md

## 构建约定

- 每次修改代码后，必须运行 `pnpm tauri build` 以打包程序。
- `pnpm tauri build` 会依次执行 `pnpm build`（`tsc -b && vite build`）与 Rust release 编译，生成 Windows 安装包（NSIS .exe 与 MSI）。
- 打包产物输出到 `src-tauri/target/release/bundle/` 目录（`nsis/` 与 `msi/` 子目录）。
- 前端构建使用 Vite（Webpack 已弃用，勿回退）。

## 项目概览

Autotile Studio：自动图块（tileset）生成桌面应用。Vite + React 19 + TypeScript + Zustand + Tailwind v4 + Tauri v2。

统一工作台（弹性三栏）：顶栏切换输入源（`sourceMode`：`procedural` 参数生成 / `slice` 导入切片）→ 左栏输入面板 → 中间 5 块基础画布（随时手绘，无文字提示）→ 右栏验证区（测试地图 / 16·47 总览）。手绘不再是独立来源模式，由 `baseDirty` 脏标记与参数实时生成互斥。

核心数据流：`baseCanvases`（基础块）→ `deriveTilesFromBase` → 派生瓦片 `Map<mask, canvas>`；`overrides`（单格微调覆盖）→ `applyOverrides` 叠加到派生瓦片；撤销/重做快照 = `{ baseCanvases, overrides }`（像素级深拷贝）。

## 文件索引（按功能查文件）

### src/lib/（核心逻辑，无 UI）
- `store.ts` — Zustand 全局状态：baseCanvases / overrides / undo·redo 栈（含 baseDirty）/ 脏标记闸门（baseDirty·baseLocked·paramDirty·regenerateBaseFromParams）/ centerView·testView 视口 / 绘制状态
- `types.ts` — 类型定义：BaseCanvases、Overrides、GenParams、TileAsset、DualAsset、MappingType、DrawTool 等
- `tile-mapping.ts` — mask 布局表：BLOB47、BLOB_STANDARD_ORDER（5×11）、BLOB_STANDARD_COLUMNS、DUAL_GRID_16_ORDER（4×4）
- `quadrant-stitch.ts` — 47/16 派生核心：deriveTilesFromBase、generateQuadrantStitch、applyOverrides、mask 位约定转换
- `dual-grid.ts` — 16 双网格圆弧渲染 `renderDualTileArc`
- `texture-generator.ts` — 47 blob 纹理渲染 `renderTile`
- `asset-factory.ts` — 导出资产 `generateTileAsset`
- `tileset-composer.ts` — 拼合 `composeSheet`（支持 spacingX/spacingY）
- `slice-freeze.ts` — 切片固化：`buildBaseFromSliceSlots` 把 5 块槽位素材提取为 baseCanvases（含角块旋转补偿：外角 +90°/内角 -90°）
- `export-presets.ts` — 导出工具：`downloadCanvasAsPNG`（浏览器回退）+ `saveCanvasAsPNG`（Tauri 走 `choose_save_path` 原生另存为）/ `canvas-geometry.ts` / `prng.ts` / `utils.ts` — 工具

### src/components/tile-studio/（UI）
- `studio-shell.tsx` — 外壳：react-resizable-panels 弹性三栏（input/work/verify，布局记忆 localStorage `autotile-workbench`）、导出入口
- `top-bar.tsx` — 顶栏（自定义窗口标题栏：拖拽区 + 窗口控制按钮 + 输入源切换分段控件）
- 左栏输入源：`mode-a-panel.tsx`（参数面板：实时生成 + 覆写确认条）、`mode-a-preview.tsx`（实时预览）、`mode-b-panel.tsx`（切图面板：换图按钮 + 切块大小/自动开关 + 横向槽位按钮 + 固化为像素）
- 切片拾取：`slice-picker-inline.tsx`（内联网格，直接嵌入左栏占满剩余区域：网格点选即绑定、自动跳下一空槽、滚轮缩放 / Shift·中键平移、支持拖拽图片导入）
- 中间画布：`mode-c-canvas.tsx`（基础 5 块手绘，画布区无文字提示，缩放工具条纯图标）、`draw-toolbar.tsx`（图标化绘制工具栏，位于中栏顶部）
- 右栏验证区：`mode-c-test-map.tsx`（测试地图）、`mode-c-overview.tsx`（16/47 总览 + 单格编辑：选择/编辑两模式，十字准星光标）
- 对话框：`export-dialog.tsx`、`help-dialog.tsx`、`sponsor-dialog.tsx`

### 其他
- `src/App.tsx`、`src/main.tsx`、`src/index.css` — Vite 入口与全局样式
- `src-tauri/` — Tauri 桌面端（tauri.conf.json、Cargo.toml、src/main.rs、src/lib.rs、capabilities/default.json、icons/）；`lib.rs` 含导出命令 `choose_save_path`（PowerShell 原生另存为对话框）+ `write_bytes`
- `public/` — 静态资源与图标
- `vite.config.ts` — Vite 配置（`@` 别名、Tailwind 插件）

## 关键约定（务必遵守）

1. 47 瓦片用 5×11 布局：47 唯一瓦片 + 8 透明空格，第 5 行前 4 格为 null（`BLOB_STANDARD_ORDER`）。
2. 16 双网格用 cr31.co.uk 4×4 标准布局（`DUAL_GRID_16_ORDER`），圆弧渲染（非 lineTo）。
3. mask 位约定：B 模式（tile-mapping / quadrant-stitch 键）TL=8,TR=4,BL=2,BR=1；`renderDualTileArc` 用 A 约定 TL=1,TR=2,BL=4,BR=8，需 `bMaskToAMask` 转换。
4. 导出标准排版：47 用 `BLOB_STANDARD_ORDER`，16 用 `DUAL_GRID_16_ORDER`；导出统一硬边渲染。
5. 像素风格瓦片禁用 ctx.arc 抗锯齿（半透明边缘），用像素级 ImageData 渲染。
6. 撤销栈快照 `{ baseCanvases, overrides, baseDirty }`，像素级深拷贝。
9. 参数实时生成闸门：干净状态（`!baseDirty && !baseLocked`）下参数变化防抖写入 baseCanvases；脏状态（手绘笔触 / 切片固化 / 总览微调均会标脏）下调参不覆写，由确认条（确认覆写 / 锁定手绘 / 还原参数）接管。
10. 画布视口（`centerView` / `testView`）存 store，跨挂载/切页保持视角。
11. 切片拾取走内联网格（`SlicePickerInline`，嵌入左栏占满剩余区域，无弹窗遮罩）；点选即 `assignModeBCell`（store 自动跳下一空槽）。原 `SlicePickerDrawer` 抽屉已删除。
12. 「固化为像素」仅 16（5 槽）/ 47（5 半块）可用（`buildBaseFromSliceSlots` → setBaseCanvases + setBaseDirty(true)）；固化后**停留切图页不切换界面**。47 切图模式恒定 5 槽（outer/inner/edge/solid/empty），无 14 槽选项、无简化开关；导出时在 `studio-shell.handleExportClick` 中直接 `generateQuadrantStitch` 拼合。已无 `modeBResult` 中间态。
7. Tauri 窗口：`tauri.conf.json` 中 `decorations: false`（自定义标题栏）；顶栏用 `data-tauri-drag-region` 实现拖拽，窗口控制按钮调用 `getCurrentWindow()` 的 minimize / toggleMaximize / close。
8. Tauri 权限：窗口操作（拖拽 / 最小化 / 最大化 / 关闭）需在 `src-tauri/capabilities/default.json` 中显式声明 `core:window:allow-*` 权限，`core:window:default` 不含这些操作权限。
13. **图片拖拽导入**：窗口必须设 `"dragDropEnabled": false`（`tauri.conf.json`），否则 Tauri 拦截文件拖放改走 `onDragDropEvent`，WebView 的 DOM `drop` 事件不触发；关闭后才由 WebView 原生处理拖放。
14. **导出选目标文件夹**：`lib.rs` 的 `choose_save_path` 用系统自带 PowerShell + WinForms 弹「另存为」对话框（文件名经环境变量传递规避转义），`write_bytes` 用 `std::fs::write` 落盘；PowerShell 子进程须设 `CREATE_NO_WINDOW`（0x08000000）避免弹出命令框。前端统一走 `saveCanvasAsPNG`（Tauri 用对话框，浏览器环境回退 `downloadCanvasAsPNG`）。因网络无法访问 crates.io，未引入 `rfd`/dialog 插件。
15. 全局样式 `index.css` 已设 `user-select: none`（桌面拖拽窗口/画布不误选文字图片），`input/textarea/contenteditable` 例外保留可编辑；`img/svg` 禁 `user-drag`。
16. 布局：绘制工具栏位于**中栏顶部**（`studio-shell.tsx`，随中栏横向伸缩），左右面板顶到与工具栏对齐；中栏其下为五格绘制区 + 16/47 总览（上下可拖拽）。
17. 总览绘制光标：编辑模式隐藏系统光标，overlay 绘制「笔刷方块（随笔刷×缩放）+ 固定尺寸十字准星（不随缩放）」；格子外也显示十字准星。DUAL16 槽位图标掩码位约定：convex=0001（右下）、concave=1110（除右下全填）、edge=0011（右列）。