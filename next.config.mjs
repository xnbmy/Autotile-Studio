/** @type {import('next').NextConfig} */
// 关键配置说明：
// 1. distDir 区分 dev(.next) 与 生产(dist-static)，避免 dev 缓存与静态导出产物互相污染。
// 2. output:"export" 与 assetPrefix:"." 仅在静态导出（生产）时启用：
//    它们会改变 dev 的渲染管线（脚本注入顺序、RSC 流式数据），
//    导致 dev 下客户端无法水合、所有按钮失灵。
const isProd = process.env.NODE_ENV === "production"
const nextConfig = {
  ...(isProd ? { output: "export", assetPrefix: "." } : {}),
  distDir: isProd ? "dist-static" : ".next",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0"],
  devIndicators: false,
}

export default nextConfig
