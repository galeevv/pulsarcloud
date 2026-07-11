import { notFound, redirect } from "next/navigation"

import { confirmTestPaymentAction } from "@/app/payments/test/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { formatRub } from "@/lib/pricing"
import { assertTestPaymentsEnabled } from "@/lib/test-payments"

export default async function TestPaymentPage({
  params,
}: {
  params: Promise<{ paymentId: string }>
}) {
  assertTestPaymentsEnabled()
  const user = await requireUser()
  const { paymentId } = await params
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })

  if (!payment || payment.userId !== user.id || payment.provider !== "TEST") {
    notFound()
  }
  if (payment.status === "SUCCEEDED") {
    redirect("/subscription?payment=test-success")
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="glass-card w-full max-w-md rounded-3xl">
        <CardHeader>
          <CardTitle>Тестовая оплата</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Деньги не списываются. Подтверждение запустит тот же workflow
            подписки и выдачи доступа в Remnawave, что и реальная оплата.
          </p>
          <div className="soft-panel p-4">
            <p className="text-sm text-muted-foreground">Номинальная сумма</p>
            <p className="text-3xl font-semibold">
              {formatRub(payment.amountRub)}
            </p>
          </div>
          <form action={confirmTestPaymentAction}>
            <input type="hidden" name="paymentId" value={payment.id} />
            <Button type="submit" size="lg" className="w-full">
              Подтвердить тестовую оплату
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
