import { redirect } from "next/navigation"

import { AuthCard } from "@/components/auth/auth-card"
import { getCurrentUser } from "@/lib/auth"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ authError?: "expired" | "used"; invite?: string }>
}) {
  const user = await getCurrentUser()

  if (user) {
    redirect("/home")
  }

  const params = await searchParams

  return <AuthCard authError={params.authError} invite={params.invite} />
}
