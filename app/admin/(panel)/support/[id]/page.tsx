import { randomUUID } from "node:crypto"
import type { Metadata } from "next"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  GiftIcon,
  HeadphonesIcon,
  MailIcon,
  RadioTowerIcon,
  SmartphoneIcon,
  UserRoundIcon,
  WalletIcon,
} from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Separator } from "@/components/ui/separator"
import { formatPreviewRub } from "@/src/frontend-preview/format"

import {
  getAdminSupportConversation,
  supportEmail,
  supportUserLabel,
} from "../_lib/query"
import {
  SupportInternalNoteForm,
  SupportReplyForm,
  SupportStatusAction,
} from "../support-actions"

export const metadata: Metadata = {
  title: "Диалог поддержки · PULSAR Admin",
}

const cardClass =
  "gap-0 rounded-3xl border border-border/70 bg-card/40 py-0 shadow-none! ring-0!"

export default async function AdminSupportConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const conversation = await getAdminSupportConversation(id)
  if (!conversation || conversation.user.role !== "USER") notFound()

  const user = conversation.user
  const title = supportUserLabel(user)
  const email = supportEmail(user)
  const telegram =
    user.telegramProfile?.username ??
    user.identities.find((identity) => identity.telegramUsername)
      ?.telegramUsername ??
    null
  const visibleMessages = conversation.messages.filter(
    (message) => !message.isInternal
  )
  const internalNotes = conversation.messages.filter(
    (message) => message.isInternal
  )

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
                <Badge
                  variant={
                    conversation.status === "OPEN" ? "secondary" : "outline"
                  }
                >
                  {conversation.status === "OPEN" ? "Открыт" : "Закрыт"}
                </Badge>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {email ?? "Email не привязан"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SupportStatusAction
              conversationId={conversation.id}
              status={conversation.status}
              initialIdempotencyKey={randomUUID()}
            />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/admin/support" />}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Все обращения
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className={cardClass}>
            <CardHeader className="gap-0 p-4">
              <CardTitle>Переписка</CardTitle>
              <CardAction>
                <Badge variant="outline">
                  {channelLabel(conversation.channel)}
                </Badge>
              </CardAction>
            </CardHeader>
            <Separator />
            <CardContent className="h-[480px] p-0">
              <MessageScrollerProvider autoScroll>
                <MessageScroller>
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="gap-4 p-4">
                      {visibleMessages.map((message) => {
                        const fromAdmin = message.authorRole === "ADMIN"
                        return (
                          <MessageScrollerItem
                            key={message.id}
                            messageId={message.id}
                            scrollAnchor={!fromAdmin}
                          >
                            <Message align={fromAdmin ? "end" : "start"}>
                              <MessageAvatar>
                                <Avatar className="size-8">
                                  <AvatarFallback>
                                    {fromAdmin ? "P" : initials(title)}
                                  </AvatarFallback>
                                </Avatar>
                              </MessageAvatar>
                              <MessageContent>
                                <MessageHeader>
                                  {fromAdmin ? "Pulsar" : title}
                                </MessageHeader>
                                <Bubble
                                  align={fromAdmin ? "end" : "start"}
                                  variant={fromAdmin ? "secondary" : "outline"}
                                >
                                  <BubbleContent className="whitespace-pre-wrap">
                                    {message.body}
                                  </BubbleContent>
                                </Bubble>
                                <MessageFooter>
                                  {dateTime(message.createdAt)}
                                </MessageFooter>
                              </MessageContent>
                            </Message>
                          </MessageScrollerItem>
                        )
                      })}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton />
                </MessageScroller>
              </MessageScrollerProvider>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader className="gap-0 p-4">
              <CardTitle>Ответ</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              {conversation.status === "OPEN" ? (
                <SupportReplyForm
                  conversationId={conversation.id}
                  channel={conversation.channel}
                  initialIdempotencyKey={randomUUID()}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Сначала откройте диалог повторно, чтобы отправить ответ.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <InfoCard title="Пользователь">
            <InfoRow
              icon={SmartphoneIcon}
              label="Telegram"
              value={telegram ? telegramLabel(telegram) : "Не привязан"}
            />
            <InfoRow
              icon={MailIcon}
              label="Email"
              value={email ?? "Не привязан"}
            />
            <InfoRow
              icon={CalendarDaysIcon}
              label="Создан"
              value={dateTime(user.createdAt)}
            />
            <InfoRow
              icon={GiftIcon}
              label="Рефералы"
              value={`${user._count.sentInvites}`}
            />
            <Button
              variant="outline"
              nativeButton={false}
              className="mt-2 w-full"
              render={<Link href={`/admin/users/${user.id}`} />}
            >
              <UserRoundIcon data-icon="inline-start" />
              Открыть пользователя
            </Button>
          </InfoCard>

          <InfoCard title="Подписка и баланс">
            <InfoRow
              icon={RadioTowerIcon}
              label="Подписка"
              value={subscriptionLabel(user.subscription)}
            />
            <InfoRow
              icon={CalendarDaysIcon}
              label="Действует до"
              value={
                user.subscription ? dateTime(user.subscription.expiresAt) : "—"
              }
            />
            <InfoRow
              icon={WalletIcon}
              label="Доступный баланс"
              value={formatPreviewRub((user.wallet?.availableMinor ?? 0) / 100)}
            />
          </InfoCard>

          <InfoCard title="Внутренние заметки">
            <div className="flex flex-col gap-3">
              {internalNotes.length ? (
                <div className="flex max-h-56 flex-col overflow-y-auto">
                  {internalNotes.map((note, index) => (
                    <div key={note.id}>
                      <div className="flex items-start gap-3 px-1 py-2.5">
                        <PulsarIconContainer icon={HeadphonesIcon} />
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap text-sm">
                            {note.body}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {dateTime(note.createdAt)}
                          </p>
                        </div>
                      </div>
                      {index < internalNotes.length - 1 ? <Separator /> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Внутренних заметок пока нет.
                </p>
              )}
              <Separator />
              <SupportInternalNoteForm
                conversationId={conversation.id}
                initialIdempotencyKey={randomUUID()}
              />
            </div>
          </InfoCard>
        </div>
      </div>
    </div>
  )
}

function InfoCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className={cardClass}>
      <CardHeader className="gap-0 p-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDaysIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
      <PulsarIconContainer icon={Icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
    </div>
  )
}

function subscriptionLabel(
  subscription: {
    status: string
    syncStatus: string
    expiresAt: Date
  } | null
) {
  if (!subscription) return "Нет"
  if (subscription.syncStatus === "FAILED") return "Ошибка синхронизации"
  if (subscription.expiresAt <= new Date()) return "Истекла"
  if (subscription.status === "TRIAL") return "Trial"
  if (subscription.status === "ACTIVE") return "Активна"
  return subscription.status
}

function telegramLabel(value: string) {
  return value.startsWith("@") ? value : `@${value}`
}

function channelLabel(channel: "WEB" | "TELEGRAM" | "EMAIL") {
  if (channel === "TELEGRAM") return "Telegram"
  if (channel === "EMAIL") return "Email"
  return "WEB"
}

function initials(value: string) {
  return value.replace(/^@/, "").slice(0, 2).toUpperCase()
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value)
}
