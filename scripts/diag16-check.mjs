// 模拟 16 模式对角十字瓦片（mask 6 = TR+BL 草、mask 9 = TL+BR 草）的两种渲染路径，
// 输出 8×8 字符图，肉眼对比草凸块的方向。
const SIZE = 16
const R = SIZE / 2
const ROUNDNESS = 0.48

function cornerDist(dx, dy) {
  const circle = Math.sqrt(dx * dx + dy * dy)
  const square = Math.max(Math.abs(dx), Math.abs(dy))
  return square * (1 - ROUNDNESS) + circle * ROUNDNESS
}

// 单个草角凸块（rounded-square quarter-sector），角在 (cx,cy)
function cornerBump(cx, cy) {
  const g = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (cornerDist(x - cx, y - cy) < R) g[y * SIZE + x] = 1
  }
  return g
}

const bg = new Uint8Array(SIZE * SIZE)

// 顺时针旋转整块
function rotImg(src, deg) {
  const n = ((deg % 360) + 360) % 360
  let m = src
  for (let i = 0; i < n / 90; i++) {
    const o = new Uint8Array(SIZE * SIZE)
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) o[y * SIZE + x] = m[(SIZE - 1 - x) * SIZE + y]
    m = o
  }
  return m
}

// drawQuarterTransformed：temp 整块变换后取 corner 子块（half×half）
function qxform(src, rot, corner) {
  const temp = rotImg(src, rot)
  const half = SIZE / 2
  const qx = corner % 2 === 1 ? half : 0
  const qy = corner >= 2 ? half : 0
  const out = new Uint8Array(half * half)
  for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) out[y * half + x] = temp[(qy + y) * SIZE + qx + x]
  return out
}

// 拼 16×16 瓦片：4 个象限（每象限 half×half）
function buildTile(qTL, qTR, qBL, qBR) {
  const half = SIZE / 2
  const tile = new Uint8Array(SIZE * SIZE)
  const put = (q, ox, oy) => { for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) if (q[y * half + x]) tile[(oy + y) * SIZE + ox + x] = 1 }
  put(qTL, 0, 0); put(qTR, half, 0); put(qBL, 0, half); put(qBR, half, half)
  return tile
}

// 打印 8×8（每 2×2 像素一块）
function show(tile, label) {
  console.log("--- " + label + " ---")
  for (let y = 0; y < SIZE; y += 2) {
    let row = ""
    for (let x = 0; x < SIZE; x += 2) {
      let c = 0
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (tile[(y + dy) * SIZE + x + dx]) c++
      row += c >= 2 ? "█" : c === 1 ? "▒" : "·"
    }
    console.log(row)
  }
}

// 素材：
// convexBL = generateBaseCanvases 的 convex（renderDualTileArc mask8=BR 凸块，顺 90° → BL 凸块）
const convexBL = rotImg(cornerBump(SIZE, SIZE), 90) // BR 凸块顺90° → BL
// convexTR = generateQuadrantStitch 的 dualSlots.convex（源图 BR 凸块 逆90° → TR 凸块）
const convexTR = rotImg(cornerBump(SIZE, SIZE), 270) // BR 凸块逆90° → TR

// 路径 A：drawSpecTile16（convex 草 BL）—— deriveTilesFromBase 使用
const bgH = () => new Uint8Array(SIZE * SIZE / 4)
const a6 = buildTile(bgH(), qxform(convexBL, 180, 1), qxform(convexBL, 0, 2), bgH())
const a9 = buildTile(qxform(convexBL, 90, 0), bgH(), bgH(), qxform(convexBL, 270, 3))
show(a6, "A: mask6 (TR+BL草) drawSpecTile16")
show(a9, "A: mask9 (TL+BR草) drawSpecTile16")

// 路径 B：generateQuadrantStitch renderMask（dualSlots.convex 草 TR）
const b6 = buildTile(bgH(), qxform(convexTR, 0, 1), qxform(convexTR, 180, 2), bgH())
const b9 = buildTile(qxform(convexTR, 270, 0), bgH(), bgH(), qxform(convexTR, 90, 3))
show(b6, "B: mask6 renderMask (convex 草TR)")
show(b9, "B: mask9 renderMask (convex 草TR)")

// 参考：renderDualTileArc 直接渲染的 S 曲线（mask6/9 的标准形状）
function renderDiagS(mask6) {
  // 对角草：填充整块，擦除两个泥土角的 rounded-square
  const tl = !!(mask6 ? 4 : 1), br = !!(mask6 ? 4 : 8), tr = !!(!mask6 ? 4 : 2), bl = !!(!mask6 ? 8 : 2)
  // 简化：用两个对角凸块并集表示 S 带的两端
  const g = new Uint8Array(SIZE * SIZE)
  const bumps = []
  if (mask6) { bumps.push(cornerBump(SIZE, 0), cornerBump(0, SIZE)) } // TR + BL
  else { bumps.push(cornerBump(0, 0), cornerBump(SIZE, SIZE)) } // TL + BR
  for (const b of bumps) for (let i = 0; i < SIZE * SIZE; i++) if (b[i]) g[i] = 1
  return g
}
show(renderDiagS(true), "参考: mask6 双凸块(TR+BL)")
show(renderDiagS(false), "参考: mask9 双凸块(TL+BR)")