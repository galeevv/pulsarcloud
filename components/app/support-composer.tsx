"use client"

import type * as React from "react"
import { SendIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

export function SupportComposer({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>
}) {
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
      action={action}
      className="flex shrink-0 flex-col gap-2 border-t border-border/70 p-3"
    >
      <InputGroup className="min-h-11 rounded-[22px] border border-border/70 bg-background/40">
        <InputGroupTextarea
          name="body"
          placeholder="Напишите сообщение"
          required
          minLength={2}
          maxLength={1000}
          rows={1}
          className="max-h-28 min-h-11 overflow-y-auto py-3"
          onKeyDown={handleKeyDown}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            variant="secondary"
            size="icon-sm"
            aria-label="Отправить сообщение"
          >
            <SendIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
