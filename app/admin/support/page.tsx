import { PreviewForm } from "@/components/frontend-preview/preview-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { getPreviewUserLabel } from "@/src/frontend-preview/format"
import { previewAdminConversations } from "@/src/frontend-preview/fixtures/mock-admin"

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "OPEN" | "CLOSED" }>
}) {
  const params = await searchParams
  const conversations = params.status
    ? previewAdminConversations.filter(
        (conversation) => conversation.status === params.status
      )
    : previewAdminConversations

  return (
    <div className="flex flex-col gap-4">
      {conversations.map((conversation) => (
        <Card key={conversation.id} className="glass-card rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>
                {getPreviewUserLabel(conversation.user.authIdentities)}
              </span>
              <Badge>{conversation.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="soft-panel flex flex-col gap-2 p-4">
              {conversation.messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-3xl border border-border/70 bg-background/40 p-3"
                >
                  <p className="text-xs text-muted-foreground">
                    {message.authorRole}
                  </p>
                  <p className="text-sm">{message.body}</p>
                </div>
              ))}
            </div>
            <PreviewForm className="flex flex-col gap-2">
              <input
                type="hidden"
                name="conversationId"
                value={conversation.id}
              />
              <Textarea name="body" placeholder="Ответ администратора" />
              <Button type="submit">Ответить</Button>
            </PreviewForm>
            <PreviewForm>
              <input
                type="hidden"
                name="conversationId"
                value={conversation.id}
              />
              <input
                type="hidden"
                name="status"
                value={conversation.status === "OPEN" ? "CLOSED" : "OPEN"}
              />
              <Button type="submit" variant="outline">
                {conversation.status === "OPEN" ? "Закрыть" : "Открыть"}
              </Button>
            </PreviewForm>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
