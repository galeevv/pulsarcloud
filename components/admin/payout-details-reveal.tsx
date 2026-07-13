"use client"
import { useState } from "react"
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
    if (details) return
    setPending(true)
    const response = await fetch(`/api/admin/payouts/${payoutId}/details`, {
      method: "POST",
    })
    if (response.ok)
      setDetails(((await response.json()) as { details: string }).details)
    setPending(false)
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
