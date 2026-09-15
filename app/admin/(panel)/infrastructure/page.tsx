import type { Metadata } from "next"
import { CalendarClockIcon, CheckCircle2Icon, CircleDollarSignIcon } from "lucide-react"

import { markInfrastructurePaymentPaid } from "@/app/admin/actions"
import { InfrastructurePaymentForm } from "@/components/admin/infrastructure-payment-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = { title: "Инфраструктура · PULSAR Admin" }

const cardClass = "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

export default async function AdminInfrastructurePage() {
  await requireWebSession("ADMIN")
  const payments = await db.infrastructurePayment.findMany({ orderBy: [{ status: "asc" }, { dueAt: "asc" }] })
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <Card className={cardClass}>
        <CardHeader className="p-4"><CardTitle>Новый инфраструктурный платёж</CardTitle></CardHeader>
        <Separator />
        <CardContent className="p-4"><InfrastructurePaymentForm /></CardContent>
      </Card>
      <Card className={cardClass}>
        <CardHeader className="p-4"><CardTitle>Инфраструктура сервиса</CardTitle></CardHeader>
        <Separator />
        <CardContent className="p-0">
          {payments.length ? payments.map((payment) => {
            const paid = payment.status === "PAID"
            return (
              <div key={payment.id} className="flex flex-wrap items-center gap-3 border-b border-border/70 p-4 last:border-b-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
                  {paid ? <CheckCircle2Icon /> : <CalendarClockIcon />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{payment.title}</p>
                  <p className="text-sm text-muted-foreground">{payment.vendor} · оплатить до {date(payment.dueAt)}</p>
                  {payment.note ? <p className="mt-1 text-xs text-muted-foreground">{payment.note}</p> : null}
                </div>
                <Badge variant={paid ? "secondary" : "outline"}>{formatPreviewRub(payment.amountMinor / 100)}</Badge>
                {paid ? <Badge variant="secondary">Оплачено</Badge> : (
                  <form action={markInfrastructurePaymentPaid}>
                    <input type="hidden" name="paymentId" value={payment.id} />
                    <Button type="submit" size="sm"><CircleDollarSignIcon data-icon="inline-start" />Оплачено</Button>
                  </form>
                )}
              </div>
            )
          }) : <p className="p-8 text-center text-sm text-muted-foreground">Платежей пока нет.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function date(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(value)
}
