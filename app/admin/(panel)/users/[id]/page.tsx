import { randomUUID } from "node:crypto"
import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  GiftIcon,
  HeadphonesIcon,
  KeyRoundIcon,
  MailIcon,
  PercentIcon,
  RadioTowerIcon,
  SendIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UserRoundIcon,
} from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AdminSubscriptionDialog } from "@/components/admin/admin-subscription-dialog"
import { PartnerEnrollmentControls } from "@/components/admin/partner-enrollment-controls"
import { ReferralProgramToggle } from "@/components/admin/referral-program-toggle"
import { CopyButton } from "@/components/app/copy-button"
import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

export default async function AdminUserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireWebSession("ADMIN")

  const { id } = await params
  const user = await db.user.findFirst({
    where: { id, role: "USER", isTest: getConfig().testMode },
    include: {
      identities: true,
      sessions: { orderBy: { createdAt: "desc" }, take: 20 },
      subscription: {
        include: { events: { orderBy: { createdAt: "desc" }, take: 50 } },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      referralProfile: true,
      partnerEnrollment: true,
      invitedReferral: {
        include: {
          inviter: { include: { identities: true, telegramProfile: true } },
        },
      },
      supportConversation: {
        include: {
          messages: {
            where: { isInternal: false },
            orderBy: { createdAt: "asc" },
            take: 100,
          },
        },
      },
      telegramProfile: true,
    },
  })

  if (!user) notFound()

  const [auditLogs, referralCount, paidReferralCount] = await Promise.all([
    db.auditLog.findMany({
      where: {
        OR: [{ actorId: id }, { entityType: "User", entityId: id }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.referralInvite.count({ where: { inviterUserId: id } }),
    db.referralInvite.count({
      where: { inviterUserId: id, status: "PAID" },
    }),
  ])

  const email = emailLabel(user.identities)
  const telegram = telegramLabel(
    user.telegramProfile?.username,
    user.identities
  )
  const title = telegram ?? email ?? "Пользователь Pulsar"
  const subtitle = telegram && email ? email : "Контактные данные не привязаны"
  const subscription = subscriptionView(user.subscription)

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <Card className={cardClass}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-12 bg-background">
              <AvatarFallback className="bg-background text-foreground">
                {initials(title)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold">{title}</h2>
                {user.isTest ? <Badge variant="outline">TEST</Badge> : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            className="shrink-0 rounded-2xl"
            render={<Link href="/admin/users" />}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Все пользователи
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto border-b border-border/70 px-1"
        >
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="finance">Финансы</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
          <TabsTrigger value="support">Поддержка</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Контакты и аккаунт">
            <DetailRow
              icon={SmartphoneIcon}
              label="Telegram"
              value={telegram ?? "Телеграм не привязан"}
              action={
                telegram ? (
                  <Button
                    nativeButton={false}
                    size="sm"
                    variant="outline"
                    render={<Link href={`https://t.me/${telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" />}
                  >
                    <SendIcon data-icon="inline-start" />
                    Написать в Telegram
                  </Button>
                ) : undefined
              }
            />
            <DetailRow
              icon={MailIcon}
              label="Email"
              value={email ?? "Почта не привязана"}
            />
            <DetailRow
              icon={CalendarDaysIcon}
              label="Создан"
              value={dateTime(user.createdAt)}
            />
            <DetailRow
              icon={KeyRoundIcon}
              label="Последний вход"
              value={
                user.lastLoginAt
                  ? dateTime(user.lastLoginAt)
                  : "Входов ещё не было"
              }
            />
            <DetailRow
              icon={ShieldCheckIcon}
              label="Уведомления"
              value={notificationLabel(user.telegramProfile)}
            />
          </SectionCard>

          <SectionCard
            title="Подписка"
            action={
              <AdminSubscriptionDialog
                userId={user.id}
                initialIdempotencyKey={randomUUID()}
                subscription={
                  user.subscription
                    ? {
                        expiresAt: user.subscription.expiresAt,
                        deviceLimit: user.subscription.deviceLimit,
                        lteEnabled: user.subscription.lteEnabled,
                      }
                    : null
                }
              />
            }
          >
            {user.subscription ? (
              <>
                <DetailRow
                  icon={RadioTowerIcon}
                  label="Статус"
                  value={subscription.label}
                />
                <DetailRow
                  icon={CalendarDaysIcon}
                  label="Действует до"
                  value={dateTime(user.subscription.expiresAt)}
                />
                <DetailRow
                  icon={SmartphoneIcon}
                  label="Устройства"
                  value={`${user.subscription.deviceLimit}`}
                />
                <DetailRow
                  icon={RadioTowerIcon}
                  label="Plus"
                  value={
                    user.subscription.lteEnabled ? "Подключён" : "Не подключён"
                  }
                />
                <DetailRow
                  icon={KeyRoundIcon}
                  label="Ключ подписки"
                  value={user.subscription.subscriptionUrl ?? "Ключ ещё не создан"}
                  action={user.subscription.subscriptionUrl ? <CopyButton value={user.subscription.subscriptionUrl} iconOnly label="Скопировать ключ" /> : undefined}
                />
              </>
            ) : (
              <EmptyState
                icon={RadioTowerIcon}
                title="Подписки нет"
                description="У пользователя пока нет оформленной подписки."
              />
            )}
          </SectionCard>

          <SectionCard
            title="Реферальная программа"
          >
            <DetailRow
              icon={GiftIcon}
              label="Статус"
              value={user.referralProfile?.isEnabled ? "Включена" : "Выключена"}
              action={<ReferralProgramToggle userId={user.id} enabled={Boolean(user.referralProfile?.isEnabled)} />}
            />
            <DetailRow
              icon={UserRoundIcon}
              label="Пригласил"
              value={
                user.invitedReferral
                  ? userLabel(user.invitedReferral.inviter)
                  : "Самостоятельная регистрация"
              }
            />
            <DetailRow
              icon={GiftIcon}
              label="Приглашено"
              value={`${referralCount}`}
            />
            <DetailRow
              icon={CreditCardIcon}
              label="Оплатили"
              value={`${paidReferralCount}`}
            />
            <DetailRow
              icon={PercentIcon}
              label="Партнёрская ставка"
              value={
                user.partnerEnrollment?.enabled
                  ? `${user.partnerEnrollment.rateBps / 100}%`
                  : "Партнёрка выключена"
              }
              action={
                <PartnerEnrollmentControls
                  userId={user.id}
                  enabled={user.partnerEnrollment?.enabled ?? false}
                  rateBps={user.partnerEnrollment?.rateBps ?? 4000}
                />
              }
            />
          </SectionCard>

          <SectionCard title="Последние сессии">
            <CompactTable
              headers={["Тип", "Создана", "Последняя активность", "Статус"]}
              rows={user.sessions
                .slice(0, 5)
                .map((item) => [
                  item.kind,
                  dateTime(item.createdAt),
                  dateTime(item.lastSeenAt),
                  item.revokedAt ? "Завершена" : "Активна",
                ])}
              empty="Активных сессий нет."
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="finance" className="flex flex-col gap-4">
          <SectionCard title="Платежи">
            <CompactTable
              headers={["Дата", "Статус", "Сумма", "Параметры"]}
              rows={user.payments.map((item) => [
                dateTime(item.createdAt),
                item.status,
                formatPreviewRub(item.amountMinor / 100),
                `${item.durationDays} дней · ${item.deviceLimit} устр. · LTE ${item.lteEnabled ? "да" : "нет"}`,
              ])}
              empty="Платежей пока нет."
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="history" className="flex flex-col gap-4">
          <SectionCard title="История подписки">
            <CompactTable
              headers={["Дата", "Событие", "Платёж"]}
              rows={(user.subscription?.events ?? []).map((item) => [
                dateTime(item.createdAt),
                item.type,
                item.paymentId ? "Есть" : "—",
              ])}
              empty="Событий подписки пока нет."
            />
          </SectionCard>
          <SectionCard title="Журнал администратора">
            <CompactTable
              headers={["Дата", "Инициатор", "Действие", "Объект"]}
              rows={auditLogs.map((item) => [
                dateTime(item.createdAt),
                item.actorType,
                item.action,
                item.entityType,
              ])}
              empty="Записей аудита пока нет."
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="support">
          <SectionCard title="Диалог поддержки">
            {user.supportConversation?.messages.length ? (
              <div className="flex flex-col gap-2">
                {user.supportConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className="soft-panel flex flex-col gap-1 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {message.authorRole === "USER"
                          ? title
                          : message.authorRole}
                      </span>
                      <span>{dateTime(message.createdAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">
                      {message.body}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={HeadphonesIcon}
                title="Обращений нет"
                description="Пользователь ещё не писал в поддержку."
              />
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className={cardClass}>
      <CardHeader className="gap-0 p-4">
        <CardTitle>{title}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <Separator />
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  )
}

function DetailRow({
  action,
  icon: Icon,
  label,
  value,
  attention = false,
}: {
  action?: ReactNode
  icon: LucideIcon
  label: string
  value: ReactNode
  attention?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
      <PulsarIconContainer icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span
          className={`block truncate text-sm font-medium ${attention ? "text-destructive" : ""}`}
        >
          {value}
        </span>
      </span>
      {action ? <span className="shrink-0">{action}</span> : null}
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <Empty className="min-h-48 border-0 p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function CompactTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: string[][]
  empty: string
}) {
  if (!rows.length)
    return (
      <p className="px-2 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    )
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={`${rowIndex}:${row[0]}`}>
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={`${cellIndex}:${cell}`}
                  className="max-w-sm whitespace-nowrap"
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function emailLabel(
  items: Array<{
    provider: string
    emailNormalized: string | null
    providerSubject: string
  }>
) {
  const identity = items.find((item) => item.provider === "EMAIL")
  return identity?.emailNormalized ?? identity?.providerSubject ?? null
}

function telegramLabel(
  username: string | null | undefined,
  items: Array<{ provider: string; telegramUsername: string | null }>
) {
  const value =
    username ??
    items.find((item) => item.provider === "TELEGRAM")?.telegramUsername
  if (!value) return null
  return value.startsWith("@") ? value : `@${value}`
}

function userLabel(user: {
  identities: Array<{
    provider: string
    emailNormalized: string | null
    providerSubject: string
    telegramUsername: string | null
  }>
  telegramProfile: { username: string | null } | null
}) {
  return (
    telegramLabel(user.telegramProfile?.username, user.identities) ??
    emailLabel(user.identities) ??
    "Пользователь Pulsar"
  )
}

function subscriptionView(
  subscription: { status: string; syncStatus: string; expiresAt: Date } | null
) {
  if (!subscription)
    return { label: "Нет", note: "Подписка не оформлена", attention: false }
  if (subscription.syncStatus === "FAILED")
    return {
      label: "Ошибка",
      note: "Не удалось синхронизировать",
      attention: true,
    }
  if (subscription.expiresAt <= new Date())
    return {
      label: "Истекла",
      note: `Истекла ${date(subscription.expiresAt)}`,
      attention: true,
    }
  if (subscription.status === "TRIAL")
    return {
      label: "Trial",
      note: `До ${date(subscription.expiresAt)}`,
      attention: false,
    }
  if (subscription.status === "ACTIVE")
    return {
      label: "Активна",
      note: `До ${date(subscription.expiresAt)}`,
      attention: false,
    }
  return {
    label: subscription.status,
    note: `До ${date(subscription.expiresAt)}`,
    attention: false,
  }
}

function notificationLabel(
  profile: {
    transactionalNotificationsEnabled: boolean
    newsNotificationsEnabled: boolean
  } | null
) {
  if (!profile) return "Telegram не привязан"
  const enabled = [
    profile.transactionalNotificationsEnabled && "сервисные",
    profile.newsNotificationsEnabled && "новости",
  ].filter(Boolean)
  return enabled.length ? `Включены: ${enabled.join(", ")}` : "Выключены"
}

function initials(value: string) {
  return value.replace(/^@/, "").slice(0, 2).toUpperCase()
}

function date(value: Date) {
  return new Intl.DateTimeFormat("ru-RU").format(value)
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}
