import type { Metadata } from "next"
import { HeadphonesIcon } from "lucide-react"

import { SupportComposer } from "@/components/app/support-composer"
import { toSupportThreadMessage } from "@/components/app/support-message"
import { SupportThread } from "@/components/app/support-thread"
import { Card, CardContent } from "@/components/ui/card"
import { getUserView } from "@/src/server/queries/user-dashboard"
import { requireWebSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: "Поддержка",
}

export default async function SupportPage() {
  const session = await requireWebSession("USER")
  const { user } = await getUserView(session.userId)
  const messages = [...(user.supportConversation?.messages ?? [])]
    .reverse()
    .map(toSupportThreadMessage)

  return (
    <main className="pulsar-container">
      <Card className="h-[min(720px,calc(100svh-7.5rem))] min-h-[520px] gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0 sm:h-[720px]">
        <CardContent className="flex size-full min-h-0 flex-col p-0">
          <div className="flex min-h-[56px] items-center gap-3 border-b border-border/70 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
                <HeadphonesIcon className="size-4" />
              </div>
              <h1 className="truncate text-sm leading-5 font-medium">
                Чат поддержки
              </h1>
            </div>
          </div>

          <SupportThread messages={messages} />

          <SupportComposer />
        </CardContent>
      </Card>
    </main>
  )
}
