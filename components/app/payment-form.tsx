"use client"

import { useState } from "react"

import { createPaymentAction } from "@/app/(dashboard)/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatRub } from "@/lib/pricing"

const durationItems = [
  { label: "1 месяц", value: "1" },
  { label: "3 месяца", value: "3" },
  { label: "6 месяцев", value: "6" },
  { label: "12 месяцев", value: "12" },
]

export function PaymentForm({
  settings,
}: {
  settings: {
    minDeviceLimit: number
    maxDeviceLimit: number
    baseMonthlyPriceRub: number
    lteMonthlyPriceRub: number
  }
}) {
  const [months, setMonths] = useState("1")
  const [lteEnabled, setLteEnabled] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  return (
    <form action={createPaymentAction} className="flex w-full flex-col gap-3">
      <input type="hidden" name="months" value={months} />
      <input type="hidden" name="lteEnabled" value={lteEnabled ? "on" : ""} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="months-trigger">Срок</FieldLabel>
          <Select
            items={durationItems}
            value={months}
            onValueChange={(value) => {
              if (value) {
                setMonths(value)
              }
            }}
          >
            <SelectTrigger id="months-trigger" className="w-full">
              <SelectValue placeholder="Выберите срок" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {durationItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="paymentDeviceLimit">Устройства</FieldLabel>
          <Input
            id="paymentDeviceLimit"
            name="deviceLimit"
            type="number"
            min={settings.minDeviceLimit}
            max={settings.maxDeviceLimit}
            defaultValue={settings.minDeviceLimit}
          />
          <FieldDescription>
            База: {formatRub(settings.baseMonthlyPriceRub)} / месяц.
          </FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            checked={lteEnabled}
            onCheckedChange={(checked) => setLteEnabled(checked === true)}
          />
          <FieldLabel className="font-normal">
            LTE add-on +{formatRub(settings.lteMonthlyPriceRub)} / месяц
          </FieldLabel>
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg">
        Оплатить подписку
      </Button>
    </form>
  )
}
