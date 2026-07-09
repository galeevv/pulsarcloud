"use client"

import * as React from "react"
import { toast } from "sonner"

export function PaymentStatusToast({
  amountLabel,
  show,
}: {
  amountLabel: string
  show: boolean
}) {
  const shownRef = React.useRef(false)

  React.useEffect(() => {
    if (!show || shownRef.current) {
      return
    }

    shownRef.current = true
    toast.info("Платеж создан", {
      description: `В dev-режиме подтвердите его в admin: ${amountLabel}.`,
    })
  }, [amountLabel, show])

  return null
}
