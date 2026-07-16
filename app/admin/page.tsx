import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/auth/auth-card"
import { getSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: "Вход · PULSAR Admin",
}

export default async function AdminAuthPage() {
  const session = await getSession("ADMIN")
  if (session?.user.role === "ADMIN") redirect("/admin/dashboard")

  return <AuthCard admin />
}
