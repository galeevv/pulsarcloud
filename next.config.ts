import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env.PULSAR_HTTP_E2E === "true" ? ".next-http-e2e" : ".next",
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]
  },
}

export default nextConfig
