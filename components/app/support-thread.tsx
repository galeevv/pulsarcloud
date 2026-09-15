"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowDownIcon, HeadphonesIcon } from "lucide-react"

import {
  SUPPORT_MESSAGES_REFRESH_EVENT,
  toSupportThreadMessage,
  type SupportThreadMessage,
} from "@/components/app/support-message"
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"

export type { SupportThreadMessage } from "@/components/app/support-message"

export function SupportThread({
  messages: initialMessages,
  live = true,
}: {
  messages: SupportThreadMessage[]
  live?: boolean
}) {
  const router = useRouter()
  const markedThrough = React.useRef<string | null>(null)
  const [threadState, setThreadState] = React.useState(() => ({
    messages: initialMessages,
    source: initialMessages,
  }))
  const messages =
    threadState.source === initialMessages
      ? threadState.messages
      : initialMessages

  const markRenderedRepliesRead = React.useCallback(
    async (renderedMessages: SupportThreadMessage[]) => {
      const latestAdminReply = [...renderedMessages]
        .reverse()
        .find((message) => message.authorRole === "ADMIN")
      if (
        !latestAdminReply ||
        markedThrough.current === latestAdminReply.createdAtIso
      )
        return

      markedThrough.current = latestAdminReply.createdAtIso
      try {
        const response = await fetch("/api/support/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ through: latestAdminReply.createdAtIso }),
        })
        if (response.ok) router.refresh()
        else markedThrough.current = null
      } catch {
        markedThrough.current = null
      }
    },
    [router]
  )

  React.useEffect(() => {
    if (!live) return
    void markRenderedRepliesRead(messages)
  }, [live, markRenderedRepliesRead, messages])

  React.useEffect(() => {
    if (!live) return
    let active = true

    const refresh = async () => {
      try {
        const response = await fetch("/api/support/messages", {
          cache: "no-store",
        })
        if (!response.ok) return
        const result = (await response.json()) as {
          messages?: Array<{
            id: string
            authorRole: string
            body: string
            createdAt: string
          }>
        }

        if (!active || !Array.isArray(result.messages)) return

        const refreshedMessages = result.messages.map(toSupportThreadMessage)
        setThreadState({
          messages: refreshedMessages,
          source: initialMessages,
        })
        void markRenderedRepliesRead(refreshedMessages)
      } catch {
        // A transient polling failure does not disrupt the conversation UI.
      }
    }

    const handleRefresh = () => {
      void refresh()
    }

    window.addEventListener(SUPPORT_MESSAGES_REFRESH_EVENT, handleRefresh)
    const timer = window.setInterval(refresh, 10_000)

    return () => {
      active = false
      window.removeEventListener(SUPPORT_MESSAGES_REFRESH_EVENT, handleRefresh)
      window.clearInterval(timer)
    }
  }, [initialMessages, live, markRenderedRepliesRead])

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport
          aria-label="Сообщения поддержки"
          style={{ scrollbarGutter: messages.length ? "stable" : "auto" }}
        >
          <MessageScrollerContent
            aria-live="polite"
            aria-relevant="additions text"
            className={
              messages.length
                ? "gap-4 px-3 py-4"
                : "justify-center gap-4 px-3 py-4"
            }
          >
            {messages.length ? (
              messages.map((message, index) => {
                const isUser = message.authorRole === "USER"
                const startsDay =
                  index === 0 ||
                  messages[index - 1]?.createdAtDayKey !==
                    message.createdAtDayKey

                return (
                  <React.Fragment key={message.id}>
                    {startsDay ? (
                      <MessageScrollerItem>
                        <Marker variant="separator" className="text-xs">
                          <MarkerContent>
                            {message.createdAtDayLabel}
                          </MarkerContent>
                        </Marker>
                      </MessageScrollerItem>
                    ) : null}
                    <MessageScrollerItem messageId={message.id}>
                      <Message align={isUser ? "end" : "start"}>
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
                            {message.createdAtLabel}
                          </MessageFooter>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  </React.Fragment>
                )
              })
            ) : (
              <MessageScrollerItem className="flex min-h-0 flex-1 items-center justify-center">
                <Empty className="size-full min-h-64 border border-border/70 bg-background/25 p-6">
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
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton>
          <ArrowDownIcon data-icon="inline-start" />
          <span className="sr-only">К последнему сообщению</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
