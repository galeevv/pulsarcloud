"use client"

import * as React from "react"
import { toast } from "sonner"

import { setPartnerEnrollment } from "@/app/admin/actions"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

export function PartnerEnrollmentControls({
  userId,
  enabled,
  rateBps,
}: {
  userId: string
  enabled: boolean
  rateBps: number
}) {
  const [rate, setRate] = React.useState(String(rateBps / 100))
  const [pending, setPending] = React.useState(false)

  async function submit(nextEnabled: boolean) {
    setPending(true)
    const data = new FormData()
    data.set("userId", userId)
    data.set("enabled", String(nextEnabled))
    data.set("rateBps", String(Math.round(Number(rate) * 100)))
    try {
      await setPartnerEnrollment(data)
      toast.success(nextEnabled ? "Партнёрка включена." : "Партнёрка выключена.")
    } catch {
      toast.error("Не удалось изменить настройки.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Ставка партнёрской программы, процентов"
          className="w-20"
          type="number"
          min="1"
          max="100"
          step="1"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) => void submit(checked)}
        aria-label="Включить партнёрскую программу"
      />
    </div>
  )
}
