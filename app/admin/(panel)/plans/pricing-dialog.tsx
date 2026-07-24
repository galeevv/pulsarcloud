"use client"

import * as React from "react"
import { PencilIcon } from "lucide-react"
import { toast } from "sonner"

import {
  updatePricingSettings,
  type PricingActionState,
} from "@/app/admin/(panel)/plans/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import type { AdminPlansView } from "./query"

const initialState: PricingActionState = {
  status: "idle",
  message: "",
}

function rub(valueMinor: number) {
  return String(valueMinor / 100)
}

export function PricingDialog({
  idempotencyKey: initialIdempotencyKey,
  pricing,
}: {
  idempotencyKey: string
  pricing: AdminPlansView["pricing"]
}) {
  const [open, setOpen] = React.useState(false)
  const [idempotencyKey, setIdempotencyKey] = React.useState(
    initialIdempotencyKey
  )
  const [availability, setAvailability] = React.useState<
    Record<number, boolean>
  >(() =>
    Object.fromEntries(
      [1, 3, 6, 12].map((months) => [
        months,
        pricing.availableDurations.includes(months as 1 | 3 | 6 | 12),
      ])
    )
  )
  const [state, formAction, pending] = React.useActionState(
    updatePricingSettings,
    initialState
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message, {
        description: state.version
          ? `Текущая версия: ${state.version}.`
          : undefined,
      })
    } else if (state.status === "error") toast.error(state.message)
  }, [state])

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && open) {
      formRef.current?.reset()
      setAvailability(
        Object.fromEntries(
          [1, 3, 6, 12].map((months) => [
            months,
            pricing.availableDurations.includes(months as 1 | 3 | 6 | 12),
          ])
        )
      )
      setIdempotencyKey(globalThis.crypto.randomUUID())
    }
    setOpen(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button type="button" size="sm" variant="outline" />}
      >
        <PencilIcon data-icon="inline-start" />
        Редактировать
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Настройки тарифов</DialogTitle>
          <DialogDescription>
            Изменения применяются к следующим покупкам и продлениям. Уже
            созданные платежи сохраняют собственный снимок цены.
          </DialogDescription>
        </DialogHeader>

        <form key={pricing.version} ref={formRef} action={formAction}>
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input
            type="hidden"
            name="expectedVersion"
            value={pricing.version}
          />
          <FieldGroup className="gap-5">
            <FieldSet>
              <FieldLegend>Стоимость, ₽</FieldLegend>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <MoneyField
                  id="pricing-base"
                  name="baseRub"
                  label="База за месяц"
                  defaultValue={rub(pricing.baseMonthlyPriceMinor)}
                  error={state.fieldErrors?.baseRub}
                  disabled={pending}
                />
                <MoneyField
                  id="pricing-extra-device"
                  name="extraDeviceRub"
                  label="Доп. устройство за месяц"
                  defaultValue={rub(pricing.extraDeviceMonthlyPriceMinor)}
                  error={state.fieldErrors?.extraDeviceRub}
                  disabled={pending}
                />
                <MoneyField
                  id="pricing-device-upgrade"
                  name="deviceUpgradeRub"
                  label="Разовое увеличение лимита"
                  defaultValue={rub(pricing.deviceLimitUpgradePriceMinor)}
                  error={state.fieldErrors?.deviceUpgradeRub}
                  disabled={pending}
                />
                <MoneyField
                  id="pricing-lte"
                  name="lteRub"
                  label="LTE за месяц"
                  defaultValue={rub(pricing.lteMonthlyPriceMinor)}
                  error={state.fieldErrors?.lteRub}
                  disabled={pending}
                />
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Названия и доступность</FieldLegend>
              <FieldGroup className="grid gap-3 sm:grid-cols-2">
                {[1, 3, 6, 12].map((months) => (
                  <div
                    key={months}
                    className="soft-panel flex items-end gap-3 p-3"
                  >
                    <Field className="min-w-0 flex-1">
                      <FieldLabel htmlFor={`pricing-plan-name-${months}`}>
                        Тариф на {months} мес.
                      </FieldLabel>
                      <Input
                        id={`pricing-plan-name-${months}`}
                        name={`planName${months}`}
                        minLength={2}
                        maxLength={60}
                        defaultValue={pricing.planNames[String(months)]}
                        disabled={pending}
                        required
                      />
                    </Field>
                    <div className="flex h-9 items-center gap-2">
                      <input
                        type="hidden"
                        name={`available${months}`}
                        value={String(Boolean(availability[months]))}
                      />
                      <Switch
                        checked={Boolean(availability[months])}
                        onCheckedChange={(checked) =>
                          setAvailability((current) => ({
                            ...current,
                            [months]: checked,
                          }))
                        }
                        disabled={pending}
                        aria-label={`Доступность тарифа на ${months} месяцев`}
                      />
                    </div>
                  </div>
                ))}
              </FieldGroup>
              <FieldError>
                {state.fieldErrors?.planNames ??
                  state.fieldErrors?.availability}
              </FieldError>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Скидки по срокам, %</FieldLegend>
              <FieldGroup className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[1, 3, 6, 12].map((months) => (
                  <Field key={months}>
                    <FieldLabel htmlFor={`pricing-discount-${months}`}>
                      {months} мес.
                    </FieldLabel>
                    <Input
                      id={`pricing-discount-${months}`}
                      name={`discount${months}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={90}
                      step={1}
                      defaultValue={
                        pricing.durationDiscounts[String(months)] ?? 0
                      }
                      disabled={pending}
                      required
                    />
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Ограничения и реферальная программа</FieldLegend>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id="pricing-min-devices"
                  name="minDevices"
                  label="Устройств включено"
                  min={1}
                  max={5}
                  defaultValue={pricing.minDeviceLimit}
                  disabled={pending}
                />
                <NumberField
                  id="pricing-max-devices"
                  name="maxDevices"
                  label="Максимум устройств"
                  min={1}
                  max={5}
                  defaultValue={pricing.maxDeviceLimit}
                  error={state.fieldErrors?.maxDevices}
                  disabled={pending}
                />
                <MoneyField
                  id="pricing-referral-reward"
                  name="referralRewardRub"
                  label="Реферальная награда"
                  defaultValue={rub(pricing.referralRewardMinor)}
                  disabled={pending}
                />
                <NumberField
                  id="pricing-referral-trial"
                  name="referralTrialDays"
                  label="Пробный период, дней"
                  min={1}
                  max={365}
                  defaultValue={pricing.referralTrialDays}
                  disabled={pending}
                />
                <MoneyField
                  id="pricing-min-payout"
                  name="minimalPayoutRub"
                  label="Минимальная выплата"
                  defaultValue={rub(pricing.minimalPayoutMinor)}
                  disabled={pending}
                />
              </FieldGroup>
            </FieldSet>

            <Field data-invalid={Boolean(state.fieldErrors?.reason)}>
              <FieldLabel htmlFor="pricing-reason">
                Причина изменения
              </FieldLabel>
              <Textarea
                id="pricing-reason"
                name="reason"
                minLength={5}
                maxLength={500}
                placeholder="Например: обновление коммерческих условий"
                disabled={pending}
                aria-invalid={Boolean(state.fieldErrors?.reason)}
                required
              />
              <FieldDescription>
                Причина и полный снимок до/после сохранятся в AuditLog.
              </FieldDescription>
              <FieldError>{state.fieldErrors?.reason}</FieldError>
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохраняем…" : "Сохранить новую версию"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MoneyField({
  defaultValue,
  disabled,
  error,
  id,
  label,
  name,
}: {
  defaultValue: string
  disabled: boolean
  error?: string
  id: string
  label: string
  name: string
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        min={0}
        max={1_000_000}
        step={0.01}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        required
      />
      <FieldError>{error}</FieldError>
    </Field>
  )
}

function NumberField({
  defaultValue,
  disabled,
  error,
  id,
  label,
  max,
  min,
  name,
}: {
  defaultValue: number
  disabled: boolean
  error?: string
  id: string
  label: string
  max: number
  min: number
  name: string
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        required
      />
      <FieldError>{error}</FieldError>
    </Field>
  )
}
