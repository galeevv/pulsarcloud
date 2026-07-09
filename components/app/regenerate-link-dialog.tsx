"use client"

import { RefreshCwIcon } from "lucide-react"

import { regenerateSubscriptionUrlAction } from "@/app/(dashboard)/actions"
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
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="outline" />}>
        <RefreshCwIcon data-icon="inline-start" />
        Перевыпустить ссылку
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Перевыпустить ссылку?</AlertDialogTitle>
          <AlertDialogDescription>
            Старая ссылка перестанет работать. Устройства, подключённые по старой ссылке, могут отвалиться.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <form action={regenerateSubscriptionUrlAction}>
            <AlertDialogAction render={<Button type="submit" />}>
              Перевыпустить
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
