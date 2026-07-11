"use client"

import { RefreshCwIcon } from "lucide-react"

import { PreviewAlertAction } from "@/components/frontend-preview/preview-form"
import {
  AlertDialog,
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
            Старая ссылка перестанет работать. Устройства, подключённые по
            старой ссылке, могут отвалиться.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <PreviewAlertAction>Перевыпустить</PreviewAlertAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
