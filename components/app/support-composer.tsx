"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SendIcon } from "lucide-react"
import { toast } from "sonner"

import { SUPPORT_MESSAGES_REFRESH_EVENT } from "@/components/app/support-message"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

export function SupportComposer() {
  const router = useRouter()
  const [body, setBody] = React.useState("")
  const [pending, setPending] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const messageBody = body.trim()

    if (pending || messageBody.length < 2) return

    setPending(true)

    try {
      const response = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageBody }),
      })

      if (!response.ok) {
        toast.error(await getResponseErrorMessage(response))
        return
      }

      setBody("")
      window.dispatchEvent(new Event(SUPPORT_MESSAGES_REFRESH_EVENT))
      router.refresh()
    } catch {
      toast.error("Не удалось отправить сообщение. Проверьте соединение.")
    } finally {
      setPending(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <form
      onSubmit={submit}
      className="flex shrink-0 flex-col gap-2 border-t border-border/70 p-3"
    >
      <InputGroup className="min-h-11 rounded-[22px] border border-border/70 bg-background/40">
        <InputGroupTextarea
          name="body"
          placeholder="Напишите сообщение"
          aria-label="Сообщение в поддержку"
          required
          minLength={2}
          maxLength={1000}
          rows={1}
          className="max-h-28 min-h-11 overflow-y-auto py-3"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pending}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            variant="secondary"
            size="icon-sm"
            aria-label="Отправить сообщение"
            disabled={pending || body.trim().length < 2}
          >
            <SendIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

async function getResponseErrorMessage(response: Response) {
  try {
    const result: unknown = await response.json()

    if (
      typeof result === "object" &&
      result !== null &&
      "message" in result &&
      typeof result.message === "string"
    ) {
      return result.message
    }
  } catch {
    // The response may intentionally have no JSON body.
  }

  return "Не удалось отправить сообщение."
}
