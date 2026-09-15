"use client"

import * as React from "react"
import { ArrowUpRightIcon } from "lucide-react"

import {
  createPartnerPayout,
  type PartnerPayoutActionState,
} from "@/app/(dashboard)/partner/actions"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const initialState: PartnerPayoutActionState = { status: "idle", message: "" }

export function PartnerPayoutForm({ minAmountRub }: { minAmountRub: number }) {
  const [state, formAction, pending] = React.useActionState(
    createPartnerPayout,
    initialState
  )
  const [idempotencyKey] = React.useState(() => crypto.randomUUID())
  const [bank, setBank] = React.useState("")

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="bank" value={bank} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="partner-payout-amount">Сумма, ₽</FieldLabel>
          <Input
            id="partner-payout-amount"
            name="amountRub"
            type="number"
            min={minAmountRub}
            step="1"
            placeholder={String(minAmountRub)}
            required
          />
          <FieldDescription>
            Минимальная сумма: {minAmountRub} ₽.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="partner-payout-recipient">
            По номеру телефона или карты
          </FieldLabel>
          <Input
            id="partner-payout-recipient"
            name="recipient"
            inputMode="tel"
            autoComplete="off"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="partner-payout-bank">Банк</FieldLabel>
          <Select value={bank} onValueChange={(value) => setBank(value ?? "")}>
            <SelectTrigger id="partner-payout-bank" className="w-full">
              <SelectValue placeholder="Выберите банк" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Сбербанк">Сбербанк</SelectItem>
              <SelectItem value="Альфа-Банк">Альфа-Банк</SelectItem>
              <SelectItem value="Тиньков">Тиньков</SelectItem>
              <SelectItem value="Ozon Банк">Ozon Банк</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        <ArrowUpRightIcon data-icon="inline-start" />
        {pending ? "Отправляем…" : "Создать заявку"}
      </Button>
    </form>
  )
}
