"use client"

import * as React from "react"
import { RotateCcwIcon, Trash2Icon } from "lucide-react"
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
  cancelOutboxJob,
  retryOutboxJob,
  type OperationActionState,
} from "./actions"

const initialState: OperationActionState = { status: "idle", message: "" }

export function JobActions({
  jobId,
  retryable,
  cancellable,
  retryIdempotencyKey,
  cancelIdempotencyKey,
}: {
  jobId: string
  retryable: boolean
  cancellable: boolean
  retryIdempotencyKey: string
  cancelIdempotencyKey: string
}) {
  const [retryState, retryAction, retryPending] = React.useActionState(
    retryOutboxJob,
    initialState
  )
  const [cancelState, cancelAction, cancelPending] = React.useActionState(
    cancelOutboxJob,
    initialState
  )

  React.useEffect(() => {
    if (retryState.status === "idle") return
    if (retryState.status === "success") toast.success(retryState.message)
    else toast.error(retryState.message)
  }, [retryState])

  React.useEffect(() => {
    if (cancelState.status === "idle") return
    if (cancelState.status === "success") toast.success(cancelState.message)
    else toast.error(cancelState.message)
  }, [cancelState])

  if (!retryable && !cancellable) return null

  return (
    <div className="flex justify-end gap-1">
      {retryable ? (
        <form action={retryAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <input
            type="hidden"
            name="idempotencyKey"
            value={retryIdempotencyKey}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            disabled={retryPending}
            aria-label="Повторить задачу"
          >
            <RotateCcwIcon />
          </Button>
        </form>
      ) : null}
      {cancellable ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Отменить задачу"
              />
            }
          >
            <Trash2Icon />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Отменить ожидающую задачу?</AlertDialogTitle>
              <AlertDialogDescription>
                Доступно только для ещё не отправленного Telegram-уведомления
                или рассылки. Действие будет записано в AuditLog.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Назад</AlertDialogCancel>
              <form action={cancelAction}>
                <input type="hidden" name="jobId" value={jobId} />
                <input
                  type="hidden"
                  name="idempotencyKey"
                  value={cancelIdempotencyKey}
                />
                <AlertDialogAction
                  type="submit"
                  variant="destructive"
                  disabled={cancelPending}
                >
                  {cancelPending ? "Отменяем…" : "Отменить задачу"}
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}
