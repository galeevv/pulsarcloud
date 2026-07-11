"use client"

import * as React from "react"
import { toast } from "sonner"

import { AlertDialogAction } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { backendUnavailableMessage } from "@/src/frontend-preview/config"

export function PreviewForm({
  children,
  message = backendUnavailableMessage,
  ...props
}: Omit<React.ComponentProps<"form">, "action"> & { message?: string }) {
  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit?.(event)
        toast.info(message)
      }}
    >
      {children}
    </form>
  )
}

export function previewUnavailable() {
  toast.info(backendUnavailableMessage)
}

export function PreviewAlertAction({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <AlertDialogAction
      type="button"
      variant="outline"
      className={className}
      onClick={previewUnavailable}
    >
      {children}
    </AlertDialogAction>
  )
}

export function PreviewButton({
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "type">) {
  return (
    <Button type="button" {...props} onClick={previewUnavailable}>
      {children}
    </Button>
  )
}
