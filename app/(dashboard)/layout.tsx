import { BottomNav } from "@/components/app/bottom-nav"
import { requireUser } from "@/lib/auth"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUser()

  return (
    <div className="pulsar-page">
      {children}
      <BottomNav />
    </div>
  )
}
