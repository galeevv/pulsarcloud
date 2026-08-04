import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function SupportUnreadDot({ className }: { className?: string }) {
  return (
    <Badge
      aria-label="Есть непрочитанный ответ поддержки"
      className={cn("size-2 min-w-0 rounded-full p-0", className)}
    >
      <span className="sr-only">Есть непрочитанный ответ поддержки</span>
    </Badge>
  )
}
