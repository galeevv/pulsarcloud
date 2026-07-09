"use client"

import { CopyIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function CopyButton({
  className,
  iconOnly = false,
  label = "Скопировать",
  value,
}: {
  className?: string
  iconOnly?: boolean
  label?: string
  value: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-sm" : "default"}
      className={cn(className)}
      aria-label={iconOnly ? label : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          toast.success("Ссылка скопирована")
        } catch {
          toast.error("Не удалось скопировать ссылку")
        }
      }}
    >
      <CopyIcon data-icon={iconOnly ? undefined : "inline-start"} />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </Button>
  )
}
