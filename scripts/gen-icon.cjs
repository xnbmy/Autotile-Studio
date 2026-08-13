// 生成九宫格 ICO 图标（纯 Node，无依赖）
// 九宫格 = Autotile 的 3x3 瓦片拼接概念，配主题深色背景 + 圆角色块
const fs = require("fs")
const path = require("path")

const SIZES = [16, 24, 32, 48, 64, 128, 256]

// 主题色
const BG = { r: 0x0b, g: 0x0b, b: 0x0f } // #0b0b0f
const TILE = { r: 0x38, g: 0xb6, b: 0xff } // 主题蓝
const TILE2 = { r: 0x60, g: 0xa5, b: 0xfa } // 浅蓝
const ACCENT = { r: 0xf4, g: 0x72, b: 0xb6 } // 粉强调

function rgbaToBgr(r, g, b, a) {
  return [b, g, r, a]
}

// 生成一张 RGBA 像素缓冲
function makeImage(size) {
  const buf = Buffer.alloc(size * size * 4)
  // 背景渐变（简单：上深下略亮）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / (size - 1)
      const r = Math.round(BG.r + (BG.r + 12 - BG.r) * t)
      const g = Math.round(BG.g + (BG.g + 14 - BG.g) * t)
      const b = Math.round(BG.b + (BG.b + 26 - BG.b) * t)
      const idx = (y * size + x) * 4
      buf[idx] = r
      buf[idx + 1] = g
      buf[idx + 2] = b
      buf[idx + 3] = 255
    }
  }

  const pad = Math.max(1, Math.round(size * 0.1))
  const gridArea = size - pad * 2
  const cell = gridArea / 3
  const gap = Math.max(1, Math.round(cell * 0.12))
  const radius = Math.max(1, Math.round(cell * 0.18))

  // 3x3 圆角色块
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const cx0 = pad + gx * cell + gap
      const cy0 = pad + gy * cell + gap
      const cx1 = pad + (gx + 1) * cell - gap
      const cy1 = pad + (gy + 1) * cell - gap
      // 颜色：边缘格用主题蓝，中心格用粉强调，其余浅蓝
      let col = TILE
      if (gx === 1 && gy === 1) col = ACCENT
      else if (gx === 0 || gx === 2 || gy === 0 || gy === 2) col = TILE
      else col = TILE2

      for (let y = Math.floor(cy0); y < Math.ceil(cy1); y++) {
        for (let x = Math.floor(cx0); x < Math.ceil(cx1); x++) {
          // 圆角裁剪
          const dx = Math.min(x - cx0, cx1 - 1 - x)
          const dy = Math.min(y - cy0, cy1 - 1 - y)
          if (dx < radius && dy < radius) {
            const ddx = radius - dx
            const ddy = radius - dy
            if (ddx * ddx + ddy * ddy > radius * radius) continue
          }
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          const idx = (y * size + x) * 4
          buf[idx] = col.r
          buf[idx + 1] = col.g
          buf[idx + 2] = col.b
          buf[idx + 3] = 255
        }
      }
    }
  }
  return buf
}

// 构建 ICO 文件
function buildIco() {
  const images = SIZES.map((s) => ({ size: s, data: makeImage(s) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(images.length, 4)

  const entries = Buffer.alloc(images.length * 16)
  const dibs = []
  let offset = 6 + images.length * 16

  images.forEach((img, i) => {
    // BMP DIB: BITMAPINFOHEADER + pixel data (BGRA) + AND mask
    const w = img.size
    const h = img.size
    const bpp = 32
    const pixelBytes = w * h * 4
    const andMaskBytes = Math.ceil(w / 32) * 4 * h
    const dibSize = 40 + pixelBytes + andMaskBytes

    const dib = Buffer.alloc(dibSize)
    dib.writeUInt32LE(40, 0) // biSize
    dib.writeInt32LE(w, 4) // width
    dib.writeInt32LE(h * 2, 8) // height (icon height x2 for AND mask)
    dib.writeUInt16LE(1, 12) // planes
    dib.writeUInt16LE(bpp, 14) // bpp
    dib.writeUInt32LE(0, 16) // compression
    dib.writeUInt32LE(pixelBytes + andMaskBytes, 20) // image size
    dib.writeInt32LE(0, 24) // xppm
    dib.writeInt32LE(0, 28) // yppm
    dib.writeUInt32LE(0, 32) // colors used
    dib.writeUInt32LE(0, 36) // important colors

    // 像素：自下而上，BGRA
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = ((h - 1 - y) * w + x) * 4
        const dstIdx = 40 + (y * w + x) * 4
        dib[dstIdx] = img.data[srcIdx + 2] // B
        dib[dstIdx + 1] = img.data[srcIdx + 1] // G
        dib[dstIdx + 2] = img.data[srcIdx] // R
        dib[dstIdx + 3] = img.data[srcIdx + 3] // A
      }
    }
    // AND mask 全 0（不透明）
    dibs.push(dib)

    // entry
    entries.writeUInt8(w === 256 ? 0 : w, i * 16) // width (0 = 256)
    entries.writeUInt8(h === 256 ? 0 : h, i * 16 + 1)
    entries.writeUInt8(0, i * 16 + 2) // colors
    entries.writeUInt8(0, i * 16 + 3) // reserved
    entries.writeUInt16LE(1, i * 16 + 4) // planes
    entries.writeUInt16LE(bpp, i * 16 + 6) // bpp
    entries.writeUInt32LE(dibSize, i * 16 + 8) // data size
    entries.writeUInt32LE(offset, i * 16 + 12) // data offset
    offset += dibSize
  })

  return Buffer.concat([header, entries, ...dibs])
}

const outPath = path.join(__dirname, "..", "public", "autotile-icon.ico")
const ico = buildIco()
fs.writeFileSync(outPath, ico)
console.log("Wrote", outPath, ico.length, "bytes")
