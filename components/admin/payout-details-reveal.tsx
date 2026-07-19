"use client"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function PayoutDetailsReveal({
  payoutId,
  masked,
}: {
  payoutId: string
  masked: string
}) {
  const [details, setDetails] = useState<string>()
  const [pending, setPending] = useState(false)
  async function reveal() {
    if (details || pending) return
    setPending(true)
    try {
      const response = await fetch(`/api/admin/payouts/${payoutId}/details`, {
        method: "POST",
      })
      if (!response.ok) {
        toast.error("Не удалось загрузить реквизиты.")
        return
      }
      const payload = (await response.json()) as { details?: unknown }
      if (typeof payload.details !== "string")
        throw new Error("Invalid payout details response")
      setDetails(payload.details)
    } catch {
      toast.error("Не удалось загрузить реквизиты.")
    } finally {
      setPending(false)
    }
  }
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="outline" onClick={reveal} />
        }
      >
        {masked}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Реквизиты выплаты</DialogTitle>
          <DialogDescription>
            Просмотр записан в AuditLog. Не копируйте реквизиты в логи или
            тикеты.
          </DialogDescription>
        </DialogHeader>
        <p className="font-mono text-sm break-all">
          {pending ? "Загрузка…" : (details ?? "Не удалось загрузить")}
        </p>
      </DialogContent>
    </Dialog>
  )
}
