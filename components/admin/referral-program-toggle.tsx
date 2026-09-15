"use client"

import * as React from "react"
import { toast } from "sonner"

import { setReferralProgram } from "@/app/admin/actions"
import { Switch } from "@/components/ui/switch"

export function ReferralProgramToggle({
  userId,
  enabled,
}: {
  userId: string
  enabled: boolean
}) {
  const [pending, setPending] = React.useState(false)

  async function toggle(nextEnabled: boolean) {
    setPending(true)
    try {
      const data = new FormData()
      data.set("userId", userId)
      data.set("enabled", String(nextEnabled))
      await setReferralProgram(data)
      toast.success(nextEnabled ? "Реферальная программа включена." : "Реферальная программа выключена.")
    } catch {
      toast.error("Не удалось изменить реферальную программу.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Switch
      checked={enabled}
      disabled={pending}
      onCheckedChange={(checked) => void toggle(checked)}
      aria-label="Включить реферальную программу"
    />
  )
}
