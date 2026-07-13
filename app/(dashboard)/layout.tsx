import { BottomNav } from "@/components/app/bottom-nav"
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
        <div className="sticky top-0 z-50 border-b border-amber-400/40 bg-amber-300 px-3 py-1 text-center text-xs font-semibold text-amber-950">
          TEST MODE · платежи и VPN-подключения ненастоящие
        </div>
      ) : null}
      {children}
      <BottomNav />
    </div>
  )
}
