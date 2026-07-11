import { BottomNav } from "@/components/app/bottom-nav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="pulsar-page">
      {children}
      <BottomNav />
    </div>
  )
}
