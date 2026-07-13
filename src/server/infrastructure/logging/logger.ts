import { getConfig } from "@/src/server/config"

type Context = Record<string, unknown>
function write(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context: Context = {}
) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  }
  const line =
    getConfig().appEnv === "production"
      ? JSON.stringify(payload)
      : `[${level}] ${message} ${JSON.stringify(context)}`
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}
export const logger = {
  debug: (m: string, c?: Context) => write("debug", m, c),
  info: (m: string, c?: Context) => write("info", m, c),
  warn: (m: string, c?: Context) => write("warn", m, c),
  error: (m: string, c?: Context) => write("error", m, c),
}
