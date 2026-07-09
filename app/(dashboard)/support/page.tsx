import { HeadphonesIcon } from "lucide-react"

import { createSupportMessageAction } from "@/app/(dashboard)/actions"
import { SupportComposer } from "@/components/app/support-composer"
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import { ScrollArea } from "@/components/ui/scroll-area"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"

export default async function SupportPage() {
  const user = await requireUser()
  const conversation = await prisma.supportConversation.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  })
  const messages = conversation?.messages ?? []

  return (
    <main className="pulsar-container">
      <Card className="h-[min(720px,calc(100svh-7.5rem))] min-h-[520px] gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0 sm:h-[720px]">
        <CardContent className="flex size-full min-h-0 flex-col p-0">
          <div className="flex min-h-[56px] items-center gap-3 border-b border-border/70 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
                <HeadphonesIcon className="size-4" />
              </div>
              <p className="truncate text-sm leading-5 font-medium">
                Чат поддержки
              </p>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex min-h-full flex-col gap-4 px-3 py-4">
              {messages.length ? (
                <>
                  <Marker variant="separator" className="text-xs">
                    <MarkerContent>Сегодня</MarkerContent>
                  </Marker>
                  {messages.map((message) => {
                    const isUser = message.authorRole === "USER"

                    return (
                      <Message
                        key={message.id}
                        align={isUser ? "end" : "start"}
                      >
                        <MessageContent>
                          <BubbleGroup>
                            <Bubble
                              align={isUser ? "end" : "start"}
                              variant={isUser ? "default" : "outline"}
                            >
                              <BubbleContent>{message.body}</BubbleContent>
                            </Bubble>
                          </BubbleGroup>
                          <MessageFooter>
                            {formatMessageTime(message.createdAt)}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    )
                  })}
                </>
              ) : (
                <Empty className="min-h-64 border border-border/70 bg-background/25 p-6">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HeadphonesIcon />
                    </EmptyMedia>
                    <EmptyTitle>Напишите нам</EmptyTitle>
                    <EmptyDescription>
                      Поможем с оплатой, подпиской или настройкой VPN.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </ScrollArea>

          <SupportComposer action={createSupportMessageAction} />
        </CardContent>
      </Card>
    </main>
  )
}

function formatMessageTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}
