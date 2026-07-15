import { BottomNav } from "@/components/app/bottom-nav"
import { Badge } from "@/components/ui/badge"
import { redirect } from "next/navigation"
import { getSession } from "@/src/server/transport/web/session"
import { getConfig } from "@/src/server/config"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await getSession("USER"))) redirect("/")
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
      <BottomNav />
    </div>
  )
}
