"use client"

import * as React from "react"
import { WalletIcon } from "lucide-react"
import { toast } from "sonner"
import {
  adjustWallet,
  type WalletAdjustmentActionState,
} from "@/app/admin/actions"
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
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatPreviewRub } from "@/src/frontend-preview/format"

const initialState: WalletAdjustmentActionState = {
  status: "idle",
  message: "",
}

export function WalletAdjustmentDialog({
  availableMinor,
  initialIdempotencyKey,
  userId,
}: {
  availableMinor: number
  initialIdempotencyKey: string
  userId: string
}) {
  const [open, setOpen] = React.useState(false)
  const [idempotencyKey, setIdempotencyKey] = React.useState(
    initialIdempotencyKey
  )
  const [state, formAction, pending] = React.useActionState(
    adjustWallet,
    initialState
  )
  const formRef = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    if (state.status === "idle") return
    if (state.status === "success") {
      toast.success(state.message, {
        description:
          state.availableMinor === undefined
            ? undefined
            : `Доступно: ${formatPreviewRub(state.availableMinor / 100)}`,
      })
    } else toast.error(state.message)
  }, [state])

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && open) {
      formRef.current?.reset()
      setIdempotencyKey(globalThis.crypto.randomUUID())
    }
    setOpen(nextOpen)
  }

  const amountError = state.fieldErrors?.deltaRub
  const commentError = state.fieldErrors?.comment

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={<Button type="button" size="sm" variant="outline" />}
      >
        <WalletIcon data-icon="inline-start" />
        Изменить баланс
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Корректировка внутреннего баланса</DialogTitle>
          <DialogDescription>
            Сейчас доступно {formatPreviewRub(availableMinor / 100)}. Каждая
            операция сохраняется в ledger и AuditLog.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(amountError)}>
              <FieldLabel htmlFor={`wallet-delta-${userId}`}>
                Сумма, ₽
              </FieldLabel>
              <Input
                id={`wallet-delta-${userId}`}
                name="deltaRub"
                type="number"
                inputMode="numeric"
                min={-1_000_000}
                max={1_000_000}
                step={1}
                placeholder="500 или -200"
                required
                disabled={pending}
                aria-invalid={Boolean(amountError)}
              />
              <FieldDescription>
                Положительная сумма начисляет средства, отрицательная —
                списывает. Копейки не поддерживаются.
              </FieldDescription>
              <FieldError>{amountError}</FieldError>
            </Field>
            <Field data-invalid={Boolean(commentError)}>
              <FieldLabel htmlFor={`wallet-comment-${userId}`}>
                Комментарий
              </FieldLabel>
              <Textarea
                id={`wallet-comment-${userId}`}
                name="comment"
                minLength={5}
                maxLength={500}
                placeholder="Причина начисления или списания"
                required
                disabled={pending}
                aria-invalid={Boolean(commentError)}
              />
              <FieldDescription>
                Комментарий будет сохранён вместе с финансовой операцией.
              </FieldDescription>
              <FieldError>{commentError}</FieldError>
            </Field>
            {state.status === "error" && !amountError && !commentError ? (
              <FieldError aria-live="polite">{state.message}</FieldError>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохраняем…" : "Применить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
