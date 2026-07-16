import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AdminShell } from "@/components/admin/admin-shell"
import { getConfig } from "@/src/server/config"
import { getSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: "PULSAR Admin",
}

export default async function AdminPanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession("ADMIN")
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const config = getConfig()
  return (
    <AdminShell
      adminTelegramUsername={config.admin.telegramUsername}
      testMode={config.testMode}
    >
      {children}
    </AdminShell>
  )
}
