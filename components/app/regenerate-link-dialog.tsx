"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"
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

export function RegenerateLinkDialog() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function regenerate() {
    setPending(true)

    try {
      const response = await fetch("/api/subscription/regenerate", {
        method: "POST",
      })
      const result = (await response.json()) as { message?: string }

      if (!response.ok) {
        throw new Error(result.message ?? "Не удалось перевыпустить ссылку.")
      }

      toast.success("Новая ссылка создаётся.")
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось перевыпустить ссылку."
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" className="w-full" />}
      >
        <RefreshCwIcon data-icon="inline-start" />
        Перевыпустить ссылку
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Перевыпустить ссылку?</AlertDialogTitle>
          <AlertDialogDescription>
            Старая ссылка перестанет работать после синхронизации. Подключённые
            устройства потребуется настроить заново.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={regenerate}>
            {pending ? "Создаём…" : "Перевыпустить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
