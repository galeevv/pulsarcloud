import "dotenv/config"
import { rm } from "node:fs/promises"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const url = process.env.TEST_DATABASE_URL ?? "file:./prisma/test.db"
if (!url.startsWith("file:")) throw new Error("TEST_DATABASE_URL must be a local SQLite file")
const file = resolve(url.slice(5))
if (!file.endsWith("test.db")) throw new Error(`Refusing to delete non-test database: ${file}`)
for (const suffix of ["", "-wal", "-shm"]) await rm(`${file}${suffix}`, { force: true })
const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, APP_ENV: "test", DATABASE_URL: url, PULSAR_TEST_MODE: "true" } })
if (result.status !== 0) process.exit(result.status ?? 1)
