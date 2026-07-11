import Link from "next/link"

const adminLinks = [
  ["/admin", "Dashboard"],
  ["/admin/users", "Users"],
  ["/admin/subscriptions", "Subscriptions"],
  ["/admin/payments", "Payments"],
  ["/admin/wallet", "Wallet"],
  ["/admin/referrals", "Referrals"],
  ["/admin/payouts", "Payout Requests"],
  ["/admin/support", "Support Chat"],
  ["/admin/nodes", "Nodes"],
  ["/admin/integration-logs", "Integration Logs"],
  ["/admin/settings", "Settings"],
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="pulsar-admin-container">
      <header className="glass-card rounded-3xl border p-4">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Pulsar 2.0</p>
            <h1 className="text-2xl font-semibold">Admin</h1>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {adminLinks.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="shrink-0 rounded-3xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}
