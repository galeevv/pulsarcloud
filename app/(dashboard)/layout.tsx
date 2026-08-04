import { BottomNav } from "@/components/app/bottom-nav"
import { Badge } from "@/components/ui/badge"
import { redirect } from "next/navigation"
import { getSession } from "@/src/server/transport/web/session"
import { getConfig } from "@/src/server/config"
import { hasUnreadSupportReply } from "@/src/server/queries/user-dashboard"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession("USER")
  if (!session) redirect("/")
  const hasUnreadSupport = await hasUnreadSupportReply(session.userId)
  return (
    <div className="pulsar-page">
      {getConfig().testMode ? (
        <Badge
          variant="outline"
          className="pointer-events-none fixed right-3 bottom-20 z-30 bg-background/85 backdrop-blur"
          title="Тестовые платежи; подписки создаются без списания денег."
        >
          TEST MODE
        </Badge>
      ) : null}
      {children}
      <BottomNav hasUnreadSupport={hasUnreadSupport} />
    </div>
  )
}
