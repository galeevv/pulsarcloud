import { randomUUID } from "node:crypto"
import type { Metadata } from "next"
import { ArrowLeftIcon, UserRoundIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { toSupportThreadMessage } from "@/components/app/support-message"
import { SupportThread } from "@/components/app/support-thread"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import {
  getAdminSupportConversation,
  supportUserLabel,
} from "../_lib/query"
import { SupportReplyForm } from "../support-actions"

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
  const visibleMessages = conversation.messages.filter(
    (message) => !message.isInternal
  )
  const threadMessages = visibleMessages.map(toSupportThreadMessage)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-8 pb-4 md:px-6 md:pb-6">
      <Card className={`${cardClass} overflow-hidden`}>
        <CardContent className="relative flex min-h-[56px] items-center justify-center gap-3 border-b border-border/70 px-14 py-2">
          <div className="flex min-w-0 items-center justify-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
              <UserRoundIcon className="size-4" />
            </div>
            <h1 className="truncate text-sm font-medium">
              <Link href={`/admin/users/${user.id}`} className="underline-offset-4 hover:underline">
                {title}
              </Link>
            </h1>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            size="icon-sm"
            aria-label="Все обращения"
            className="absolute left-3"
            render={<Link href="/admin/support" />}
          >
            <ArrowLeftIcon />
          </Button>
        </CardContent>
        <CardContent className="flex h-[min(720px,calc(100svh-14rem))] min-h-[520px] flex-col p-0">
          <SupportThread messages={threadMessages} live={false} />
        </CardContent>
        <Separator />
        <CardContent className="p-4">
              {conversation.status === "OPEN" ? (
                <SupportReplyForm
                  conversationId={conversation.id}
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
  )
}

