"use client"

import { useMemo, useState } from "react"
import { WalletIcon } from "lucide-react"

import { createPayoutRequestAction } from "@/app/(dashboard)/actions"
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatRub } from "@/lib/pricing"

const bankItems = [
  { label: "Сбербанк", value: "sber" },
  { label: "Альфа-Банк", value: "alfa" },
  { label: "Т-Банк", value: "tbank" },
  { label: "Ozon Банк", value: "ozon" },
  { label: "Другой", value: "other" },
]

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
  const [bank, setBank] = useState(bankItems[0].value)
  const [otherBank, setOtherBank] = useState("")
  const [destination, setDestination] = useState("")
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const selectedBankLabel = useMemo(() => {
    if (bank === "other") {
      return otherBank.trim() || "Другой банк"
    }

    return bankItems.find((item) => item.value === bank)?.label ?? bank
  }, [bank, otherBank])
  const payoutDetails = `Банк: ${selectedBankLabel}; Реквизит: ${destination.trim()}`

  return (
    <Dialog>
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
        {buttonIcon ? <WalletIcon data-icon="inline-start" /> : null}
        Вывести
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Заявка на вывод</DialogTitle>
          <DialogDescription>
            Минимальная сумма: {formatRub(minimalPayoutRub)}.
          </DialogDescription>
        </DialogHeader>
        <form
          action={createPayoutRequestAction}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="payoutDetails" value={payoutDetails} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="payout-bank-trigger">Банк</FieldLabel>
              <Select
                items={bankItems}
                value={bank}
                onValueChange={(value) => {
                  if (value) {
                    setBank(value)
                  }
                }}
              >
                <SelectTrigger id="payout-bank-trigger" className="w-full">
                  <SelectValue placeholder="Выберите банк" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {bankItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {bank === "other" ? (
              <Field>
                <FieldLabel htmlFor="otherBank">Название банка</FieldLabel>
                <Input
                  id="otherBank"
                  value={otherBank}
                  onChange={(event) => setOtherBank(event.target.value)}
                  placeholder="Укажите банк"
                  required
                />
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="payoutDestination">
                Номер телефона или карты
              </FieldLabel>
              <Input
                id="payoutDestination"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="+7 900 000-00-00 или номер карты"
                autoComplete="off"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="amountRub">Сумма</FieldLabel>
              <Input
                id="amountRub"
                name="amountRub"
                type="number"
                min={minimalPayoutRub}
                defaultValue={defaultAmountRub}
                required
              />
            </Field>
          </FieldGroup>
          <Button type="submit">Создать заявку</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
