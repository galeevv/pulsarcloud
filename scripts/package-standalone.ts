import { cp, mkdir, rm, stat } from "node:fs/promises"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const standalone = resolve(root, ".next/standalone")

await stat(resolve(standalone, "server.js"))
await mkdir(resolve(standalone, ".next"), { recursive: true })
await cp(resolve(root, "public"), resolve(standalone, "public"), { recursive: true, force: true })
await cp(resolve(root, ".next/static"), resolve(standalone, ".next/static"), { recursive: true, force: true })
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  await rm(resolve(standalone, name), { force: true })
}
await stat(resolve(standalone, "public/hero/pulsar.gif"))
await stat(resolve(standalone, ".next/static"))
