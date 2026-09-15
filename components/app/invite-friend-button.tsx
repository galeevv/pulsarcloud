"use client"

import { Share2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function InviteFriendButton({ inviteUrl }: { inviteUrl: string }) {
  async function shareInvite() {
    const text = "Присоединяйся к PulsarVPN — другу доступен бесплатный день."
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "PulsarVPN", text, url: inviteUrl })
      } catch {
        // Отмена системного меню — это не ошибка.
      }
      return
    }

    const subject = encodeURIComponent("Приглашение в PulsarVPN")
    const body = encodeURIComponent(`${text}\n\n${inviteUrl}`)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
    toast.success("Открываем почтовое приложение")
  }

  return (
    <Button
      type="button"
      variant="default"
      size="lg"
      className="h-11 w-full rounded-[18px]"
      onClick={shareInvite}
    >
      <Share2Icon data-icon="inline-start" />
      Пригласить друга
    </Button>
  )
}
