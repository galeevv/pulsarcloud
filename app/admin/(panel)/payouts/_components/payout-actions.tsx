"use client"

import { CheckIcon, CircleCheckBigIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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
import {
  Dialog,
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
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

import {
  transitionAdminPayout,
  type PayoutTransitionInput,
} from "../_actions/payout-actions"

function CommentField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field data-invalid={value.length > 0 && value.trim().length < 5}>
      <FieldLabel htmlFor={id}>Комментарий администратора</FieldLabel>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Укажите основание для изменения статуса"
        minLength={5}
        maxLength={500}
        rows={4}
        required
        aria-invalid={value.length > 0 && value.trim().length < 5}
      />
      <FieldDescription>
        Комментарий сохраняется в журнале аудита.
      </FieldDescription>
    </Field>
  )
}

export function PayoutActions({
  payoutId,
  status,
}: {
  payoutId: string
  status: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [comment, setComment] = useState("")
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [paidOpen, setPaidOpen] = useState(false)

  function changeOpen(setter: (value: boolean) => void, nextOpen: boolean) {
    setter(nextOpen)
    if (nextOpen) setComment("")
  }

  function submit(
    action: PayoutTransitionInput["action"],
    close: (value: boolean) => void
  ) {
    if (comment.trim().length < 5) {
      toast.error("Комментарий должен содержать не менее 5 символов.")
      return
    }
    startTransition(async () => {
      const result = await transitionAdminPayout({
        payoutId,
        action,
        comment,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      close(false)
      setComment("")
      router.refresh()
    })
  }

  if (status !== "PENDING" && status !== "APPROVED")
    return (
      <p className="text-sm text-muted-foreground">
        Заявка находится в конечном статусе.
      </p>
    )

  return (
    <div className="flex flex-wrap gap-2">
      {status === "PENDING" ? (
        <Dialog
          open={approveOpen}
          onOpenChange={(open) => changeOpen(setApproveOpen, open)}
        >
          <DialogTrigger render={<Button />}>
            <CheckIcon data-icon="inline-start" />
            Одобрить
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Одобрить выплату</DialogTitle>
              <DialogDescription>
                Заявка перейдёт в статус «Одобрена». Средства останутся в
                резерве до подтверждения выплаты.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit("APPROVE", setApproveOpen)
              }}
            >
              <FieldGroup>
                <CommentField
                  id="payout-approve-comment"
                  value={comment}
                  onChange={setComment}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setApproveOpen(false)}
                    disabled={pending}
                  >
                    Отмена
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Сохраняем…" : "Одобрить"}
                  </Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {status === "APPROVED" ? (
        <AlertDialog
          open={paidOpen}
          onOpenChange={(open) => changeOpen(setPaidOpen, open)}
        >
          <AlertDialogTrigger render={<Button />}>
            <CircleCheckBigIcon data-icon="inline-start" />
            Отметить выплаченной
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Подтвердить выплату?</AlertDialogTitle>
              <AlertDialogDescription>
                Сумма будет окончательно списана из резерва. Отменить эту
                операцию автоматически нельзя.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit("PAID", setPaidOpen)
              }}
            >
              <FieldGroup>
                <CommentField
                  id="payout-paid-comment"
                  value={comment}
                  onChange={setComment}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>
                    Отмена
                  </AlertDialogCancel>
                  <AlertDialogAction type="submit" disabled={pending}>
                    {pending ? "Сохраняем…" : "Подтвердить выплату"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </FieldGroup>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      <AlertDialog
        open={rejectOpen}
        onOpenChange={(open) => changeOpen(setRejectOpen, open)}
      >
        <AlertDialogTrigger render={<Button variant="destructive" />}>
          <XIcon data-icon="inline-start" />
          Отклонить
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отклонить заявку?</AlertDialogTitle>
            <AlertDialogDescription>
              Зарезервированная сумма вернётся на доступный баланс пользователя.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submit("REJECT", setRejectOpen)
            }}
          >
            <FieldGroup>
              <CommentField
                id="payout-reject-comment"
                value={comment}
                onChange={setComment}
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  type="submit"
                  variant="destructive"
                  disabled={pending}
                >
                  {pending ? "Сохраняем…" : "Отклонить"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </FieldGroup>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
