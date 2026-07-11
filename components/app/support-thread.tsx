"use client"

import * as React from "react"
import { HeadphonesIcon } from "lucide-react"

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
import { ScrollArea } from "@/components/ui/scroll-area"

export type SupportThreadMessage = {
  authorRole: string
  body: string
  createdAtLabel: string
  id: string
}

export function SupportThread({
  messages,
}: {
  messages: SupportThreadMessage[]
}) {
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const lastMessageId = messages.at(-1)?.id

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [lastMessageId, messages.length])

  return (
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
                <Message key={message.id} align={isUser ? "end" : "start"}>
                  <MessageContent>
                    <BubbleGroup>
                      <Bubble
                        align={isUser ? "end" : "start"}
                        variant={isUser ? "default" : "outline"}
                      >
                        <BubbleContent>{message.body}</BubbleContent>
                      </Bubble>
                    </BubbleGroup>
                    <MessageFooter>{message.createdAtLabel}</MessageFooter>
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
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </ScrollArea>
  )
}
