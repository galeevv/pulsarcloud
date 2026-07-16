import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card
            key={index}
            className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"
          >
            <CardHeader className="gap-0 p-4 pb-0">
              <Skeleton className="h-4 w-28" />
              <CardAction>
                <Skeleton className="size-9 rounded-xl" />
              </CardAction>
            </CardHeader>
            <CardContent className="flex items-end justify-between gap-3 p-4 pt-2">
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <Skeleton className="h-96 rounded-3xl border" />
        <Skeleton className="h-96 rounded-3xl border" />
      </div>
      <Skeleton className="h-80 rounded-3xl border" />
    </div>
  )
}
