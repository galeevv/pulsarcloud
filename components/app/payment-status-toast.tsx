"use client"

import * as React from "react"
import { toast } from "sonner"

export function PaymentStatusToast({
  amountLabel,
  error,
  show,
}: {
  amountLabel: string
  error?: string
  show: boolean
}) {
  const shownRef = React.useRef(false)
  const errorRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!show || shownRef.current) {
      return
    }

    shownRef.current = true
    toast.info("Платеж создан", {
      description: `В dev-режиме подтвердите его в admin: ${amountLabel}.`,
    })
  }, [amountLabel, show])

  React.useEffect(() => {
    if (!error || errorRef.current === error) {
      return
    }

    errorRef.current = error

    if (error === "device-limit") {
      toast.error("Не удалось изменить лимит устройств", {
        description: "Проверьте доступный диапазон и попробуйте ещё раз.",
      })
      return
    }

    if (error === "payment") {
      toast.error("Не удалось создать платеж", {
        description: "Проверьте параметры подписки и попробуйте ещё раз.",
      })
      return
    }

    toast.error("Действие не выполнено", {
      description: "Попробуйте ещё раз.",
    })
  }, [error])

  return null
}
