import type { Metadata } from "next"
import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from "lucide-react"
import Link from "next/link"

import { AdminUsersToolbar } from "@/components/admin/admin-users-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import {
  getAdminUsersView,
  parseAdminUserFilter,
  type AdminUserFilter,
} from "@/src/server/queries/admin-users"

export const metadata: Metadata = {
  title: "Пользователи · PULSAR Admin",
}

type SearchParams = Promise<{
  q?: string | string[]
  status?: string | string[]
  page?: string | string[]
}>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function telegramLabel(username: string | null) {
  if (!username) return "Telegram не привязан"
  return username.startsWith("@") ? username : `@${username}`
}

function subscriptionBadge(
  subscription: {
    status: "TRIAL" | "ACTIVE" | "CANCELED" | "SUSPENDED"
    syncStatus: "NOT_REQUIRED" | "PENDING" | "SYNCED" | "FAILED"
    expiresAt: Date
  } | null,
  now: Date
) {
  if (!subscription) return <Badge variant="secondary">None</Badge>
  if (subscription.syncStatus === "FAILED")
    return <Badge variant="destructive">Sync failed</Badge>
  if (subscription.expiresAt <= now)
    return <Badge variant="outline">Expired</Badge>
  if (subscription.status === "TRIAL")
    return <Badge variant="outline">Trial</Badge>
  if (subscription.status === "ACTIVE") return <Badge>Active</Badge>
  return <Badge variant="secondary">{subscription.status}</Badge>
}

function pageHref(input: {
  page: number
  query: string
  filter: AdminUserFilter
}) {
  const params = new URLSearchParams()
  if (input.query) params.set("q", input.query)
  if (input.filter !== "all") params.set("status", input.filter)
  if (input.page > 1) params.set("page", String(input.page))
  const suffix = params.size ? `?${params.toString()}` : ""
  return `/admin/users${suffix}`
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const query = first(params.q)?.trim().slice(0, 100) ?? ""
  const filter = parseAdminUserFilter(first(params.status))
  const requestedPage = Math.max(1, Number(first(params.page)) || 1)
  const view = await getAdminUsersView({
    query,
    filter,
    page: requestedPage,
  })
  const rangeStart = view.total ? (view.page - 1) * view.pageSize + 1 : 0
  const rangeEnd = Math.min(view.page * view.pageSize, view.total)

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardContent className="p-4">
          <AdminUsersToolbar
            key={`${query}:${filter}`}
            query={query}
            filter={filter}
          />
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!">
        <CardHeader className="gap-0 p-4">
          <CardTitle>Список пользователей</CardTitle>
          <CardAction>
            <Badge variant="secondary">{view.total}</Badge>
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {view.users.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Telegram username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Подписка</TableHead>
                  <TableHead>Действует до</TableHead>
                  <TableHead className="text-right">Баланс</TableHead>
                  <TableHead className="text-right">Рефералы</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="font-mono text-xs font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {user.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {telegramLabel(user.telegramUsername)}
                    </TableCell>
                    <TableCell>{user.email ?? "Почта не привязана"}</TableCell>
                    <TableCell>
                      {subscriptionBadge(user.subscription, view.generatedAt)}
                    </TableCell>
                    <TableCell>
                      {user.subscription
                        ? new Intl.DateTimeFormat("ru-RU").format(
                            user.subscription.expiresAt
                          )
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPreviewRub(user.balanceMinor / 100)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user.referrals}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-72 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>Пользователи не найдены</EmptyTitle>
                <EmptyDescription>
                  Измените поисковый запрос или выбранный фильтр.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
        <Separator />
        <CardFooter className="flex items-center justify-between gap-3 p-3">
          <p className="text-sm text-muted-foreground">
            {rangeStart}–{rangeEnd} из {view.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              nativeButton={false}
              disabled={view.page <= 1}
              aria-label="Предыдущая страница"
              render={
                <Link
                  href={pageHref({
                    page: view.page - 1,
                    query,
                    filter,
                  })}
                />
              }
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-16 text-center text-sm tabular-nums">
              {view.page} / {view.totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              nativeButton={false}
              disabled={view.page >= view.totalPages}
              aria-label="Следующая страница"
              render={
                <Link
                  href={pageHref({
                    page: view.page + 1,
                    query,
                    filter,
                  })}
                />
              }
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
