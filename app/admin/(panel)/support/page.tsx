import type { Metadata } from "next"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HeadphonesIcon,
} from "lucide-react"
import Link from "next/link"

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

import {
  getAdminSupportView,
  parseSupportFilter,
  supportEmail,
  supportUserLabel,
  type SupportFilter,
} from "./_lib/query"
import { SupportToolbar } from "./support-toolbar"

export const metadata: Metadata = {
  title: "Поддержка · PULSAR Admin",
}

const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function pageHref(input: {
  page: number
  query: string
  filter: SupportFilter
}) {
  const params = new URLSearchParams()
  if (input.query) params.set("q", input.query)
  if (input.filter !== "all") params.set("status", input.filter)
  if (input.page > 1) params.set("page", String(input.page))
  return params.size ? `/admin/support?${params.toString()}` : "/admin/support"
}

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = (first(params.q) ?? "").trim().slice(0, 100)
  const filter = parseSupportFilter(first(params.status))
  const requestedPage = Math.max(1, Number(first(params.page)) || 1)
  const view = await getAdminSupportView({
    query,
    filter,
    page: requestedPage,
  })
  const rangeStart = view.total ? (view.page - 1) * view.pageSize + 1 : 0
  const rangeEnd = Math.min(view.page * view.pageSize, view.total)

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <Card className={cardClass}>
        <CardContent className="p-4">
          <SupportToolbar
            key={`${query}:${filter}`}
            query={query}
            filter={filter}
          />
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader className="gap-0 p-4">
          <CardTitle>Обращения</CardTitle>
          <CardAction className="self-center">
            <Badge variant="secondary">{view.total}</Badge>
          </CardAction>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {view.conversations.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Тема</TableHead>
                    <TableHead>Последнее сообщение</TableHead>
                    <TableHead>Канал</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Обновлено</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.conversations.map((conversation) => {
                    const latest = conversation.messages[0]
                    return (
                      <TableRow key={conversation.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/admin/support/${conversation.id}`}
                            className="underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            {supportUserLabel(conversation.user)}
                          </Link>
                          <span className="block text-xs font-normal text-muted-foreground">
                            {supportEmail(conversation.user) ??
                              "Email не привязан"}
                          </span>
                        </TableCell>
                        <TableCell>{conversation.topic}</TableCell>
                        <TableCell className="max-w-sm">
                          <span className="block truncate">
                            {latest?.body ?? "Нет сообщений"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {channelLabel(conversation.channel)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <SupportBadge
                            classification={conversation.classification}
                          />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {dateTime(conversation.lastMessageAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="min-h-72 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HeadphonesIcon />
                </EmptyMedia>
                <EmptyTitle>Обращения не найдены</EmptyTitle>
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

function SupportBadge({
  classification,
}: {
  classification: "new" | "waiting" | "answered" | "closed"
}) {
  if (classification === "new") return <Badge>Новое</Badge>
  if (classification === "waiting")
    return <Badge variant="destructive">Ожидает</Badge>
  if (classification === "answered")
    return <Badge variant="secondary">Отвечено</Badge>
  return <Badge variant="outline">Закрыто</Badge>
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}

function channelLabel(channel: "WEB" | "TELEGRAM" | "EMAIL") {
  if (channel === "TELEGRAM") return "Telegram"
  if (channel === "EMAIL") return "Email"
  return "WEB"
}
