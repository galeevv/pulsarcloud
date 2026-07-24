"use client"

import * as React from "react"
import { PauseIcon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import {
  setPromoCampaignStatus,
  type PromoActionState,
} from "@/app/admin/(panel)/promos/actions"
import { Button } from "@/components/ui/button"

const initialState: PromoActionState = {
  status: "idle",
  message: "",
}

export function PromoCampaignControls({
  active,
  campaignId,
  ended,
}: {
  active: boolean
  campaignId: string
  ended: boolean
}) {
  const [state, formAction, pending] = React.useActionState(
    setPromoCampaignStatus,
    initialState
  )

  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message)
    else if (state.status === "error") toast.error(state.message)
  }, [state])

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="campaignId" value={campaignId} />
      <Button
        type="submit"
        name="intent"
        value={active ? "pause" : "activate"}
        variant={active ? "outline" : "default"}
        className="w-full rounded-2xl"
        disabled={pending || ended}
      >
        {active ? (
          <PauseIcon data-icon="inline-start" />
        ) : (
          <PlayIcon data-icon="inline-start" />
        )}
        {ended
          ? "Кампания завершена"
          : pending
            ? "Сохраняем…"
            : active
              ? "Приостановить"
              : "Активировать"}
      </Button>
    </form>
  )
}
