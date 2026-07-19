"use client"

import * as React from "react"
import { BanIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import {
  cancelTelegramBroadcast,
  queueTelegramBroadcast,
  type TelegramActionState,
} from "@/app/admin/(panel)/telegram/actions"
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
import { Button } from "@/components/ui/button"

const initialState: TelegramActionState = {
  status: "idle",
  message: "",
}

export function BroadcastControls({
  broadcastId,
  initialCancelKey,
  initialQueueKey,
  status,
}: {
  broadcastId: string
  initialCancelKey: string
  initialQueueKey: string
  status: "DRAFT" | "QUEUED" | "SENDING" | "COMPLETED" | "CANCELED"
}) {
  const [queueState, queueAction, queuePending] = React.useActionState(
    queueTelegramBroadcast,
    initialState
  )
  const [cancelState, cancelAction, cancelPending] = React.useActionState(
    cancelTelegramBroadcast,
    initialState
  )

  React.useEffect(() => {
    if (queueState.status === "success") toast.success(queueState.message)
    else if (queueState.status === "error") toast.error(queueState.message)
  }, [queueState])

  React.useEffect(() => {
    if (cancelState.status === "success") toast.success(cancelState.message)
    else if (cancelState.status === "error") toast.error(cancelState.message)
  }, [cancelState])

  if (!["DRAFT", "QUEUED"].includes(status)) return null

  return (
    <div className="flex items-center justify-end gap-2">
      {status === "DRAFT" ? (
        <form action={queueAction}>
          <input type="hidden" name="broadcastId" value={broadcastId} />
          <input type="hidden" name="idempotencyKey" value={initialQueueKey} />
          <Button type="submit" size="sm" disabled={queuePending}>
            <SendIcon data-icon="inline-start" />
            {queuePending ? "Ставим…" : "В очередь"}
          </Button>
        </form>
      ) : null}

      <AlertDialog>
        <AlertDialogTrigger
          render={<Button type="button" size="sm" variant="outline" />}
        >
          <BanIcon data-icon="inline-start" />
          Отменить
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить рассылку?</AlertDialogTitle>
            <AlertDialogDescription>
              Отмена доступна только пока worker не начал отправку. Все
              ожидающие доставки будут отмечены как пропущенные.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Назад</AlertDialogCancel>
            <form action={cancelAction}>
              <input type="hidden" name="broadcastId" value={broadcastId} />
              <input
                type="hidden"
                name="idempotencyKey"
                value={initialCancelKey}
              />
              <AlertDialogAction
                type="submit"
                variant="destructive"
                disabled={cancelPending}
              >
                {cancelPending ? "Отменяем…" : "Отменить рассылку"}
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
