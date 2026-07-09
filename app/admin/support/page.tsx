import {
  replySupportConversationAction,
  setSupportConversationStatusAction,
} from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { prisma } from "@/lib/db"

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "OPEN" | "CLOSED" }>
}) {
  const params = await searchParams
  const conversations = await prisma.supportConversation.findMany({
    where: params.status ? { status: params.status } : undefined,
    include: {
      user: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  })

  return (
    <div className="flex flex-col gap-4">
      {conversations.map((conversation) => (
        <Card key={conversation.id} className="glass-card rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>{conversation.user.email}</span>
              <Badge>{conversation.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="soft-panel flex flex-col gap-2 p-4">
              {conversation.messages.map((message) => (
                <div key={message.id} className="rounded-3xl border border-border/70 bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">{message.authorRole}</p>
                  <p className="text-sm">{message.body}</p>
                </div>
              ))}
            </div>
            <form action={replySupportConversationAction} className="flex flex-col gap-2">
              <input type="hidden" name="conversationId" value={conversation.id} />
              <Textarea name="body" placeholder="Ответ администратора" />
              <Button type="submit">Ответить</Button>
            </form>
            <form action={setSupportConversationStatusAction}>
              <input type="hidden" name="conversationId" value={conversation.id} />
              <input type="hidden" name="status" value={conversation.status === "OPEN" ? "CLOSED" : "OPEN"} />
              <Button type="submit" variant="outline">
                {conversation.status === "OPEN" ? "Закрыть" : "Открыть"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
