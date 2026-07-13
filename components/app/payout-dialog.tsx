"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { WalletIcon } from "lucide-react"
import { toast } from "sonner"
import { pulsarCtaClass } from "@/components/app/pulsar-primitives"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formatPreviewRub } from "@/src/frontend-preview/format"

export function PayoutDialog({
  buttonIcon = true,
  canRequestPayout,
  defaultAmountRub,
  minimalPayoutRub,
  triggerClassName = pulsarCtaClass,
}: {
  buttonIcon?: boolean
  canRequestPayout: boolean
  defaultAmountRub: number
  minimalPayoutRub: number
  triggerClassName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const key = React.useRef("")
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    key.current ||= globalThis.crypto.randomUUID()
    const data = new FormData(event.currentTarget)
    const response = await fetch("/api/wallet/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountMinor: Math.round(Number(data.get("amountRub")) * 100),
        details: `Банк: ${data.get("bank")}; Реквизит: ${data.get("destination")}`,
        idempotencyKey: key.current,
      }),
    })
    const result = (await response.json()) as { message?: string }
    if (response.ok) {
      key.current = ""
      toast.success("Заявка создана.")
      setOpen(false)
      router.refresh()
    } else toast.error(result.message ?? "Не удалось создать заявку.")
    setPending(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="lg"
            className={triggerClassName}
            disabled={!canRequestPayout}
          />
        }
      >
        {buttonIcon ? <WalletIcon data-icon="inline-start" /> : null}Вывести
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Заявка на вывод</DialogTitle>
          <DialogDescription>
            Минимальная сумма: {formatPreviewRub(minimalPayoutRub)}.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="payout-bank">Банк</FieldLabel>
              <Input id="payout-bank" name="bank" required maxLength={80} />
            </Field>
            <Field>
              <FieldLabel htmlFor="payout-destination">
                Телефон или номер карты
              </FieldLabel>
              <Input
                id="payout-destination"
                name="destination"
                autoComplete="off"
                required
                maxLength={100}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="amountRub">Сумма</FieldLabel>
              <Input
                id="amountRub"
                name="amountRub"
                type="number"
                min={minimalPayoutRub}
                step="0.01"
                defaultValue={defaultAmountRub}
                required
              />
            </Field>
          </FieldGroup>
          <Button type="submit" disabled={pending}>
            {pending ? "Создаём…" : "Создать заявку"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
