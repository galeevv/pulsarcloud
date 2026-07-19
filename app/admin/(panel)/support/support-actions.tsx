"use client"

import * as React from "react"
import {
  ArchiveIcon,
  NotebookPenIcon,
  RotateCcwIcon,
  SendIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

import {
  addSupportInternalNote,
  changeSupportStatus,
  replyToSupport,
  type SupportActionState,
} from "./actions"

const initialState: SupportActionState = { status: "idle", message: "" }

export function SupportReplyForm({
  conversationId,
  channel,
  initialIdempotencyKey,
}: {
  conversationId: string
  channel: "WEB" | "TELEGRAM" | "EMAIL"
  initialIdempotencyKey: string
}) {
  const [state, action, pending] = React.useActionState(
    replyToSupport,
    initialState
  )
  const formRef = React.useRef<HTMLFormElement>(null)
  const keyRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (state.status === "idle") return
    if (state.status === "success") {
      toast.success(state.message)
      formRef.current?.reset()
      if (keyRef.current) keyRef.current.value = crypto.randomUUID()
    } else toast.error(state.message)
  }, [state])

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <input
        ref={keyRef}
        type="hidden"
        name="idempotencyKey"
        defaultValue={initialIdempotencyKey}
      />
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors?.body)}>
          <FieldLabel htmlFor="support-reply">Ответ пользователю</FieldLabel>
          <Textarea
            id="support-reply"
            name="body"
            minLength={2}
            maxLength={1000}
            rows={5}
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors?.body)}
            placeholder="Напишите ответ…"
          />
          <FieldDescription>
            {channel === "WEB"
              ? "Ответ появится в диалоге пользователя."
              : `Ответ будет доставлен через ${
                  channel === "TELEGRAM" ? "Telegram" : "email"
                } и сохранён в истории.`}
          </FieldDescription>
          <FieldError>{state.fieldErrors?.body}</FieldError>
        </Field>
        <Field orientation="horizontal" className="justify-end">
          <Button type="submit" disabled={pending}>
            <SendIcon data-icon="inline-start" />
            {pending ? "Сохраняем…" : "Ответить"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}

export function SupportInternalNoteForm({
  conversationId,
  initialIdempotencyKey,
}: {
  conversationId: string
  initialIdempotencyKey: string
}) {
  const [state, action, pending] = React.useActionState(
    addSupportInternalNote,
    initialState
  )
  const formRef = React.useRef<HTMLFormElement>(null)
  const keyRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (state.status === "idle") return
    if (state.status === "success") {
      toast.success(state.message)
      formRef.current?.reset()
      if (keyRef.current) keyRef.current.value = crypto.randomUUID()
    } else toast.error(state.message)
  }, [state])

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <input
        ref={keyRef}
        type="hidden"
        name="idempotencyKey"
        defaultValue={initialIdempotencyKey}
      />
      <FieldGroup className="gap-3">
        <Field data-invalid={Boolean(state.fieldErrors?.body)}>
          <FieldLabel htmlFor="support-internal-note">
            Новая заметка
          </FieldLabel>
          <Textarea
            id="support-internal-note"
            name="body"
            minLength={2}
            maxLength={2000}
            rows={4}
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors?.body)}
            placeholder="Контекст для администратора…"
          />
          <FieldDescription>
            Заметка видна только в панели администратора.
          </FieldDescription>
          <FieldError>{state.fieldErrors?.body}</FieldError>
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          <NotebookPenIcon data-icon="inline-start" />
          {pending ? "Сохраняем…" : "Добавить заметку"}
        </Button>
      </FieldGroup>
    </form>
  )
}

export function SupportStatusAction({
  conversationId,
  status,
  initialIdempotencyKey,
}: {
  conversationId: string
  status: "OPEN" | "CLOSED"
  initialIdempotencyKey: string
}) {
  const nextStatus = status === "OPEN" ? "CLOSED" : "OPEN"
  const [state, action, pending] = React.useActionState(
    changeSupportStatus,
    initialState
  )

  React.useEffect(() => {
    if (state.status === "idle") return
    if (state.status === "success") toast.success(state.message)
    else toast.error(state.message)
  }, [state])

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        {nextStatus === "CLOSED" ? (
          <ArchiveIcon data-icon="inline-start" />
        ) : (
          <RotateCcwIcon data-icon="inline-start" />
        )}
        {nextStatus === "CLOSED" ? "Закрыть" : "Открыть повторно"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {nextStatus === "CLOSED"
              ? "Закрыть диалог?"
              : "Открыть диалог повторно?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Изменение статуса будет записано в AuditLog.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <form action={action}>
            <input type="hidden" name="conversationId" value={conversationId} />
            <input type="hidden" name="status" value={nextStatus} />
            <input
              type="hidden"
              name="idempotencyKey"
              value={initialIdempotencyKey}
            />
            <AlertDialogAction
              type="submit"
              variant={nextStatus === "CLOSED" ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? "Сохраняем…" : "Подтвердить"}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
