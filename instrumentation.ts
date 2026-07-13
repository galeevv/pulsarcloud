export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeDatabase } =
      await import("@/src/server/infrastructure/db/client")
    await initializeDatabase()
  }
}
