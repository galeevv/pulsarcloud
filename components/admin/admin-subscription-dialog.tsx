"use client"

import * as React from "react"
import {
  CalendarPlusIcon,
  InfoIcon,
  RadioTowerIcon,
  SmartphoneIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  manageUserSubscription,
  type SubscriptionManagementActionState,
} from "@/app/admin/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const initialState: SubscriptionManagementActionState = {
  status: "idle",
  message: "",
}

const quickDays = ["30", "90", "180", "365"]
const deviceLimits = ["1", "2", "3", "4", "5"]

export function AdminSubscriptionDialog({
  userId,
  initialIdempotencyKey,
  subscription,
}: {
  userId: string
  initialIdempotencyKey: string
  subscription: {
    expiresAt: Date
    deviceLimit: number
    lteEnabled: boolean
  } | null
}) {
  const defaultDays = "30"
  const defaultDeviceLimit = String(subscription?.deviceLimit ?? 1)
  const defaultLteEnabled = subscription?.lteEnabled ?? false
  const [open, setOpen] = React.useState(false)
  const [daysToAdd, setDaysToAdd] = React.useState(defaultDays)
  const [deviceLimit, setDeviceLimit] = React.useState(defaultDeviceLimit)
  const [lteEnabled, setLteEnabled] = React.useState(defaultLteEnabled)
  const [idempotencyKey, setIdempotencyKey] = React.useState(
    initialIdempotencyKey
  )
  const [state, formAction, pending] = React.useActionState(
    manageUserSubscription,
    initialState
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    if (state.status === "idle") return
    if (state.status === "success") {
      toast.success(state.message, {
        description: state.expiresAt
          ? `Действует до ${formatDate(state.expiresAt)}.`
          : undefined,
      })
    } else {
      toast.error(state.message)
    }
  }, [state])

  function resetForm() {
    formRef.current?.reset()
    setDaysToAdd(defaultDays)
    setDeviceLimit(defaultDeviceLimit)
    setLteEnabled(defaultLteEnabled)
    setIdempotencyKey(globalThis.crypto.randomUUID())
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && open) resetForm()
    setOpen(nextOpen)
  }

  const daysError = state.fieldErrors?.daysToAdd
  const deviceLimitError = state.fieldErrors?.deviceLimit
  const commentError = state.fieldErrors?.comment

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button type="button" size="sm" variant="outline" />}
      >
        <CalendarPlusIcon data-icon="inline-start" />
        {subscription ? "Управлять" : "Создать подписку"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Управление подпиской</DialogTitle>
          <DialogDescription>
            Добавьте дни и при необходимости измените доступные устройства или
            LTE.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="deviceLimit" value={deviceLimit} />
          <input type="hidden" name="lteEnabled" value={String(lteEnabled)} />

          <FieldGroup className="gap-5">
            <Alert>
              <InfoIcon />
              <AlertTitle>
                {subscription
                  ? `Сейчас действует до ${formatDate(subscription.expiresAt)}`
                  : "Подписка будет создана"}
              </AlertTitle>
              <AlertDescription>
                Изменения применяются сразу через очередь синхронизации. Текущий
                ключ подписки не меняется.
              </AlertDescription>
            </Alert>

            <Field data-invalid={Boolean(daysError)}>
              <FieldLabel htmlFor={`subscription-days-${userId}`}>
                Добавить дней
              </FieldLabel>
              <Input
                id={`subscription-days-${userId}`}
                name="daysToAdd"
                type="number"
                inputMode="numeric"
                min={0}
                max={3650}
                step={1}
                value={daysToAdd}
                onChange={(event) => setDaysToAdd(event.target.value)}
                disabled={pending}
                aria-invalid={Boolean(daysError)}
                required
              />
              <ToggleGroup
                value={quickDays.includes(daysToAdd) ? [daysToAdd] : []}
                onValueChange={(values) => {
                  if (values[0]) setDaysToAdd(values[0])
                }}
                variant="outline"
                size="sm"
                spacing={1}
                className="w-full"
                aria-label="Быстрый выбор срока"
              >
                {quickDays.map((days) => (
                  <ToggleGroupItem key={days} value={days} disabled={pending}>
                    +{days}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                Укажите 0, если нужно изменить только параметры действующей
                подписки.
              </FieldDescription>
              <FieldError>{daysError}</FieldError>
            </Field>

            <Field data-invalid={Boolean(deviceLimitError)}>
              <FieldLabel id={`subscription-devices-${userId}`}>
                Лимит устройств
              </FieldLabel>
              <ToggleGroup
                value={[deviceLimit]}
                onValueChange={(values) => {
                  if (values[0]) setDeviceLimit(values[0])
                }}
                variant="outline"
                spacing={1}
                className="w-full"
                aria-labelledby={`subscription-devices-${userId}`}
              >
                {deviceLimits.map((limit) => (
                  <ToggleGroupItem
                    key={limit}
                    value={limit}
                    disabled={pending}
                    aria-label={`${limit} устройств`}
                  >
                    {limit}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                Новый лимит применяется сразу и не меняет срок сам по себе.
              </FieldDescription>
              <FieldError>{deviceLimitError}</FieldError>
            </Field>

            <Field orientation="horizontal" data-disabled={pending}>
              <FieldContent>
                <FieldTitle>
                  <RadioTowerIcon />
                  LTE-доступ
                </FieldTitle>
                <FieldDescription>
                  Добавляет LTE entitlement, сохраняя стандартный доступ.
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={lteEnabled}
                onCheckedChange={setLteEnabled}
                disabled={pending}
                aria-label="Включить LTE-доступ"
              />
            </Field>

            <Field data-invalid={Boolean(commentError)}>
              <FieldLabel htmlFor={`subscription-comment-${userId}`}>
                Причина изменения
              </FieldLabel>
              <Textarea
                id={`subscription-comment-${userId}`}
                name="comment"
                minLength={5}
                maxLength={500}
                placeholder="Например: компенсация за недоступность сервиса"
                required
                disabled={pending}
                aria-invalid={Boolean(commentError)}
              />
              <FieldDescription>
                Комментарий сохраняется в AuditLog вместе с изменением.
              </FieldDescription>
              <FieldError>{commentError}</FieldError>
            </Field>

            {state.status === "error" &&
            !daysError &&
            !deviceLimitError &&
            !commentError ? (
              <FieldError aria-live="polite">{state.message}</FieldError>
            ) : null}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={pending}>
              <SmartphoneIcon data-icon="inline-start" />
              {pending ? "Сохраняем…" : "Применить изменения"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("ru-RU").format(new Date(value))
}
