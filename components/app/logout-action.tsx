"use client"

import { useState } from "react"
import { LogOutIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function LogoutAction({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "sm" : "default"}
      className={cn("text-destructive", !compact && "w-full")}
      disabled={pending}
      onClick={async () => {
        setPending(true)
        await fetch("/api/auth/logout", { method: "POST" })
        window.location.assign("/")
      }}
    >
      <LogOutIcon data-icon="inline-start" />
      {pending ? "Выходим…" : "Выйти"}
    </Button>
  )
}
