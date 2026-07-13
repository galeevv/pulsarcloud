import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthCard } from "@/components/auth/auth-card"
import { getSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: "Вход",
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ authError?: "expired" | "used"; invite?: string }>
}) {
  const params = await searchParams
  if (await getSession("ADMIN")) redirect("/admin")
  if (await getSession("USER")) redirect("/home")

  return <AuthCard authError={params.authError} invite={params.invite} />
}
