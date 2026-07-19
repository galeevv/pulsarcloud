"use client"

import * as React from "react"
import { MessageSquarePlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  createTelegramBroadcastDraft,
  type TelegramActionState,
} from "@/app/admin/(panel)/telegram/actions"
import { Badge } from "@/components/ui/badge"
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
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

const initialState: TelegramActionState = {
  status: "idle",
  message: "",
}

export function CreateBroadcastDialog({
  initialIdempotencyKey,
}: {
  initialIdempotencyKey: string
}) {
  const [open, setOpen] = React.useState(false)
  const [idempotencyKey, setIdempotencyKey] = React.useState(
    initialIdempotencyKey
  )
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [state, formAction, pending] = React.useActionState(
    createTelegramBroadcastDraft,
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
      setTitle("")
      setBody("")
      setIdempotencyKey(globalThis.crypto.randomUUID())
    }
    setOpen(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <MessageSquarePlusIcon data-icon="inline-start" />
        Создать новость
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Новая Telegram-рассылка</DialogTitle>
          <DialogDescription>
            Сначала сохранится черновик. Отправка начнётся только после
            отдельной постановки в очередь.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          <form ref={formRef} action={formAction}>
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <FieldGroup className="gap-5">
              <Field data-invalid={Boolean(state.fieldErrors?.title)}>
                <FieldLabel htmlFor="broadcast-title">Заголовок</FieldLabel>
                <Input
                  id="broadcast-title"
                  name="title"
                  minLength={2}
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={pending}
                  aria-invalid={Boolean(state.fieldErrors?.title)}
                  required
                />
                <FieldError>{state.fieldErrors?.title}</FieldError>
              </Field>
              <Field data-invalid={Boolean(state.fieldErrors?.body)}>
                <FieldLabel htmlFor="broadcast-body">Текст</FieldLabel>
                <Textarea
                  id="broadcast-body"
                  name="body"
                  minLength={2}
                  maxLength={3500}
                  rows={10}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  disabled={pending}
                  aria-invalid={Boolean(state.fieldErrors?.body)}
                  required
                />
                <FieldDescription>
                  До 3500 символов. Telegram получит заголовок и текст одним
                  сообщением.
                </FieldDescription>
                <FieldError>{state.fieldErrors?.body}</FieldError>
              </Field>
              <Field>
                <FieldTitle>Аудитория</FieldTitle>
                <FieldDescription>
                  Только пользователи, которые разрешили новости в Telegram.
                  Транзакционные уведомления отправляются отдельно.
                </FieldDescription>
              </Field>
              <Button type="submit" disabled={pending}>
                {pending ? "Сохраняем…" : "Сохранить черновик"}
              </Button>
            </FieldGroup>
          </form>

          <div className="soft-panel flex min-h-72 flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Предпросмотр</p>
              <Badge variant="secondary">Черновик</Badge>
            </div>
            <Separator />
            <div className="flex flex-1 flex-col gap-2 whitespace-pre-wrap">
              <p className="font-semibold">
                {title.trim() || "Заголовок новости"}
              </p>
              <p className="text-sm text-muted-foreground">
                {body.trim() || "Текст сообщения появится здесь."}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Закрыть
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
