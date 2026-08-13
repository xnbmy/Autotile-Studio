# Autotile Studio 全流程工厂重构 — 任务清单

> 说明：本文档为可执行任务清单，用于逐步勾选推进。每项均标注涉及文件与验收标准。

## 前置决策（实现前需先定）

- [x] **D1｜47 模式的基础块粒度**：手绘模式统一走"5 块简化模式"（`Blob5SlotKey`），其余 8 槽由 flip/rot 推导；完整 13 槽（`SLOT_ORDER`）保留为高级选项，手绘默认不进。
- [x] **D2｜`AppMode` 演进方式**：现有 `"A"|"B"` 已散布在 store/shell/top-bar，建议新增 `SourceMode = "procedural" | "slice" | "draw"` 与现有 `mode` 解耦，避免大面积字符串重命名。映射：`procedural→A`、`slice→B`、`draw→新C`。

---

## P1｜流水线重构（地基）

| # | 任务 | 涉及文件 | 验收标准 | 状态 |
|---|---|---|---|---|
| 1.1 | 引入 `SourceMode` 三入口类型，store 增加 `sourceMode` 状态与 setter | `lib/types.ts`、`lib/store.ts` | 编译通过；`sourceMode` 可三态切换且与 `mode` 正确联动 | [x] |
| 1.2 | 顶栏模式下拉改为三入口 Tab（参数生成/导入切片/手绘），映射表/图块大小保持全局 | `components/tile-studio/top-bar.tsx` | 三 Tab 可切换；"图块大小""映射表"在三态下均可见 | [x] |
| 1.3 | 顶栏新增绘制工具箱骨架（铅笔/橡皮/吸管/油漆桶/矩形线条/∞通透/网格显示/撤销重做） | `components/tile-studio/top-bar.tsx` | 按钮渲染；未实现前置灰或可点击但无副作用（P2 接实） | [x] |
| 1.4 | 中间工作区统一：新增视图切换 Tab A(基础5块编辑)/B(16·47总览)/C(3×3九宫格循环预览) | `components/tile-studio/studio-shell.tsx` | 三视图 Tab 可切换，各自为占位/现有内容 | [x] |
| 1.5 | 测试区下沉为全局底部区域（现在仅 Mode B 有"测试地图"） | `components/tile-studio/studio-shell.tsx`、`components/tile-studio/mode-b-test-map.tsx` | 三模式下均显示底部测试区，可涂抹 | [x] |
| 1.6 | 新增"固化为像素"按钮：Mode A 生成后把 5 块写入 `baseCanvases` 并切到手绘模式 | `components/tile-studio/mode-a-panel.tsx`、`lib/asset-factory.ts` | 点击后进入手绘模式且 5 块内容可编辑（P2 画布渲染后可见） | [x] |

---

## P2｜手绘引擎（核心新增）

| # | 任务 | 涉及文件 | 验收标准 | 状态 |
|---|---|---|---|---|
| 2.1 | 新增可编辑数据模型：`baseCanvases: Record<BaseSlotKey, HTMLCanvasElement>` 与 `overrides: Record<number, HTMLCanvasElement>` | `lib/types.ts`、`lib/store.ts` | 5 块像素画布为一等对象，可读可写 | [ ] |
| 2.2 | 新建手绘画布组件，渲染 5 块 + 像素网格 + 滚轮中心缩放（复用现有 zoom 逻辑） | 新组件（建议 `components/tile-studio/mode-c-canvas.tsx`） | 5 块以像素网格显示，可缩放 | [ ] |
| 2.3 | 像素画笔：按 `tileSize` 写入 ImageData；橡皮/油漆桶/吸管 | `components/tile-studio/mode-c-canvas.tsx` | 四种工具均可在 5 块上正确操作 | [ ] |
| 2.4 | ∞ 无缝通透绘制：越界回绕 + 周围 8 副本半透明平铺 + 笔触同步 | `components/tile-studio/mode-c-canvas.tsx` | 越界笔触回绕到对侧；周围副本实时同步 | [ ] |
| 2.5 | 撤销/重做：`baseCanvases` 快照栈 | `lib/store.ts` | Ctrl+Z / 顶栏按钮可撤销/重做 | [ ] |
| 2.6 | 编辑 5 块后实时重算 16/47 映射并刷新总览与测试区 | `lib/quadrant-stitch.ts` 或新增派生函数 | 改一个像素，16/47 总览与底部测试区毫秒级联动 | [ ] |

---

## P3｜Override 单格微调系统

| # | 任务 | 涉及文件 | 验收标准 | 状态 |
|---|---|---|---|---|
| 3.1 | 16/47 总览支持点选任意单格进入编辑 | 总览视图组件 | 点击单格可进入该格像素编辑 | [ ] |
| 3.2 | 被编辑格写入 `overrides` 并打"手绘微调"标记 | `lib/store.ts` | 总览中该格显示标记角标 | [ ] |
| 3.3 | 修改 5 块模板时不覆盖已 override 的格 | `lib/store.ts`、派生逻辑 | 覆盖格保持手绘内容 | [ ] |
| 3.4 | 单格"一键重置为自动拼接" | 总览视图组件 | 重置后该格恢复自动拼接、标记消失 | [ ] |

---

## P4｜印章组拼 + JSON 导出

| # | 任务 | 涉及文件 | 验收标准 | 状态 |
|---|---|---|---|---|
| 4.1 | 框选多格区域保存为 Stamp | 画布组件 + store | 可框选 2×2 等区域并命名保存 | [ ] |
| 4.2 | 印章绘制 + 随机变体笔刷 | 画布组件 | 印章可整块摆放；可设概率随机变体 | [ ] |
| 4.3 | 边缘/转角组拼模板叠加 | 画布组件 + 右侧图块库 | 拖拽"锯齿/发光边缘"叠加到 5 块边缘层 | [ ] |
| 4.4 | 导出 JSON 配置（映射表/tileSize/slots/override 元数据） | `components/tile-studio/export-dialog.tsx` | 导出 PNG 的同时生成配套 JSON | [ ] |

---

## 依赖关系

- P1 是全部地基。
- P2 依赖 P1 的 1.1 / 1.4 / 1.6。
- P3 依赖 P2 的 2.1 / 2.6。
- P4 依赖 P2 画布引擎。
