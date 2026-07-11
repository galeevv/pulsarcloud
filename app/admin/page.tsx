import {
  ActivityIcon,
  CreditCardIcon,
  RadioIcon,
  UsersIcon,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import { previewAdminMetrics } from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminDashboardPage() {
  const {
    users,
    activeSubscriptions,
    pendingPayments,
    pendingPayouts,
    turnoverRub,
  } = previewAdminMetrics

  return (
    <main className="grid gap-4 md:grid-cols-4">
      <MetricCard icon={<UsersIcon />} label="Users" value={String(users)} />
      <MetricCard
        icon={<RadioIcon />}
        label="Active subscriptions"
        value={String(activeSubscriptions)}
      />
      <MetricCard
        icon={<CreditCardIcon />}
        label="Pending payments"
        value={String(pendingPayments)}
      />
      <MetricCard
        icon={<ActivityIcon />}
        label="Pending payouts"
        value={String(pendingPayouts)}
      />
      <Card className="glass-card rounded-3xl md:col-span-4">
        <CardHeader>
          <CardTitle>Wallet ledger volume</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">
            {formatPreviewRub(turnoverRub)}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}
