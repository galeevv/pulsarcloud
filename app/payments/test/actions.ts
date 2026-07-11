"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { requireUser } from "@/lib/auth"
import { confirmTestPayment } from "@/src/server/services/billing/payment-service"

export async function confirmTestPaymentAction(formData: FormData) {
  const user = await requireUser()
  const paymentId = z.string().min(1).parse(formData.get("paymentId"))

  await confirmTestPayment(paymentId, user.id)
  redirect("/subscription?payment=test-success")
}
