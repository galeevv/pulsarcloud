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
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

import {
  addSupportInternalNote,
  changeSupportStatus,
  replyToSupport,
  type SupportActionState,
} from "./actions"

const initialState: SupportActionState = { status: "idle", message: "" }

export function SupportReplyForm({
  conversationId,
  initialIdempotencyKey,
}: {
  conversationId: string
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
      <Field data-invalid={Boolean(state.fieldErrors?.body)}>
        <InputGroup className="min-h-11 rounded-[22px] border border-border/70 bg-background/40">
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="secondary"
              size="icon-sm"
              aria-label="Отправить ответ"
              disabled={pending}
            >
              <SendIcon />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupTextarea
            id="support-reply"
            name="body"
            minLength={2}
            maxLength={1000}
            rows={1}
            required
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors?.body)}
            placeholder="Напишите ответ…"
            className="max-h-28 min-h-11 overflow-y-auto py-3"
          />
        </InputGroup>
        <FieldError>{state.fieldErrors?.body}</FieldError>
      </Field>
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
