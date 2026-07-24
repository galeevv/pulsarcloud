"use client"

import * as React from "react"
import { GiftIcon } from "lucide-react"
import { toast } from "sonner"

import {
  createPromoCampaign,
  type PromoActionState,
} from "@/app/admin/(panel)/promos/actions"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const initialState: PromoActionState = {
  status: "idle",
  message: "",
}

export function CreatePromoDialog({
  idempotencyKey: initialIdempotencyKey,
}: {
  idempotencyKey: string
}) {
  const [open, setOpen] = React.useState(false)
  const [lteEnabled, setLteEnabled] = React.useState(true)
  const [idempotencyKey, setIdempotencyKey] = React.useState(
    initialIdempotencyKey
  )
  const [state, formAction, pending] = React.useActionState(
    createPromoCampaign,
    initialState
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message)
    else if (state.status === "error") toast.error(state.message)
  }, [state])

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && open) {
      formRef.current?.reset()
      setLteEnabled(true)
      setIdempotencyKey(globalThis.crypto.randomUUID())
    }
    setOpen(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <GiftIcon data-icon="inline-start" />
        Новая кампания
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Новая промокампания</DialogTitle>
          <DialogDescription>
            Сначала создаётся черновик. Выдача начнётся только после отдельной
            активации.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction}>
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="lteEnabled" value={String(lteEnabled)} />
          <FieldGroup className="gap-5">
            <Field data-invalid={Boolean(state.fieldErrors?.name)}>
              <FieldLabel htmlFor="promo-name">Название</FieldLabel>
              <Input
                id="promo-name"
                name="name"
                minLength={3}
                maxLength={80}
                defaultValue="Открытие Pulsar"
                disabled={pending}
                aria-invalid={Boolean(state.fieldErrors?.name)}
                required
              />
              <FieldError>{state.fieldErrors?.name}</FieldError>
            </Field>

            <Field data-invalid={Boolean(state.fieldErrors?.slug)}>
              <FieldLabel htmlFor="promo-slug">Системное имя</FieldLabel>
              <Input
                id="promo-slug"
                name="slug"
                minLength={3}
                maxLength={48}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                defaultValue="launch-2026"
                disabled={pending}
                aria-invalid={Boolean(state.fieldErrors?.slug)}
                required
              />
              <FieldDescription>
                Только строчные латинские буквы, цифры и дефисы.
              </FieldDescription>
              <FieldError>{state.fieldErrors?.slug}</FieldError>
            </Field>

            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <NumberField
                id="promo-limit"
                name="claimLimit"
                label="Количество мест"
                defaultValue={100}
                min={1}
                max={100_000}
                error={state.fieldErrors?.claimLimit}
                disabled={pending}
              />
              <NumberField
                id="promo-registration-days"
                name="registrationWindowDays"
                label="Акция действует, дней"
                defaultValue={14}
                min={1}
                max={365}
                error={state.fieldErrors?.registrationWindowDays}
                disabled={pending}
              />
              <NumberField
                id="promo-duration"
                name="durationDays"
                label="Подписка, дней"
                defaultValue={30}
                min={1}
                max={365}
                error={state.fieldErrors?.durationDays}
                disabled={pending}
              />
              <NumberField
                id="promo-devices"
                name="deviceLimit"
                label="Устройств"
                defaultValue={3}
                min={1}
                max={5}
                error={state.fieldErrors?.deviceLimit}
                disabled={pending}
              />
            </FieldGroup>

            <Field orientation="horizontal" data-disabled={pending}>
              <FieldContent>
                <FieldTitle>LTE включён</FieldTitle>
                <FieldDescription>
                  Промо создаст желаемое состояние подписки с LTE.
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={lteEnabled}
                onCheckedChange={setLteEnabled}
                disabled={pending}
                aria-label="Включить LTE в промоподписку"
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Создаём…" : "Создать черновик"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
