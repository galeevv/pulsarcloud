"use client"

import * as React from "react"
import { SendIcon } from "lucide-react"
import { toast } from "sonner"

import type { SupportMessageState } from "@/app/(dashboard)/actions"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

export function SupportComposer({
  action,
}: {
  action: (
    state: SupportMessageState,
    formData: FormData
  ) => Promise<SupportMessageState>
}) {
  const formRef = React.useRef<HTMLFormElement>(null)
  const [state, formAction, isPending] = React.useActionState(action, {
    ok: false,
  })

  React.useEffect(() => {
    if (!state.message) {
      return
    }

    if (state.ok) {
      formRef.current?.reset()
      return
    }

    toast.error(state.message)
  }, [state])

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
      ref={formRef}
      action={formAction}
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
          aria-invalid={!state.ok && state.message ? true : undefined}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="submit"
            variant="secondary"
            size="icon-sm"
            aria-label="Отправить сообщение"
            disabled={isPending}
          >
            <SendIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {!state.ok && state.message ? (
        <p className="px-1 text-xs text-destructive">{state.message}</p>
      ) : null}
    </form>
  )
}
