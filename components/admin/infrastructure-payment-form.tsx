"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  createInfrastructurePayment,
  type InfrastructurePaymentActionState,
} from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const initialState: InfrastructurePaymentActionState = {
  status: "idle",
  message: "",
}

export function InfrastructurePaymentForm() {
  const [state, action, pending] = React.useActionState(
    createInfrastructurePayment,
    initialState
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    if (state.status === "idle") return
    if (state.status === "success") {
      toast.success(state.message)
      formRef.current?.reset()
    } else toast.error(state.message)
  }, [state])

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="infrastructure-title">Что оплачиваем</FieldLabel>
          <Input id="infrastructure-title" name="title" required placeholder="Например, сервер VPN" />
        </Field>
        <Field>
          <FieldLabel htmlFor="infrastructure-vendor">Где оплачивать</FieldLabel>
          <Input id="infrastructure-vendor" name="vendor" required placeholder="Hetzner, Cloudflare…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="infrastructure-amount">Сумма, ₽</FieldLabel>
            <Input id="infrastructure-amount" name="amountRubles" type="number" min="0" step="0.01" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="infrastructure-due">Когда оплатить</FieldLabel>
            <Input id="infrastructure-due" name="dueAt" type="date" required />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="infrastructure-note">Комментарий</FieldLabel>
          <Textarea id="infrastructure-note" name="note" rows={2} placeholder="Назначение, ссылка, примечание…" />
          <FieldDescription>Запись появится в журнале инфраструктурных платежей.</FieldDescription>
        </Field>
        <Button type="submit" disabled={pending}>
          <PlusIcon data-icon="inline-start" />
          {pending ? "Сохраняем…" : "Добавить платёж"}
        </Button>
      </FieldGroup>
    </form>
  )
}
