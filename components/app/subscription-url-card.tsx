import { KeyRoundIcon } from "lucide-react"

import { CopyButton } from "@/components/app/copy-button"
import { PulsarActionRow } from "@/components/app/pulsar-primitives"

export function SubscriptionUrlCard({ url }: { url: string }) {
  return (
    <PulsarActionRow
      icon={KeyRoundIcon}
      title="Ключ подписки"
      titleClassName="text-xs font-normal text-muted-foreground"
      description={
        <span className="font-mono text-sm text-foreground">
          {formatCompactSubscriptionUrl(url)}
        </span>
      }
      action={<CopyButton value={url} label="Скопировать ключ" iconOnly />}
    />
  )
}

function formatCompactSubscriptionUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean)
    const token = pathSegments[pathSegments.length - 1] ?? ""

    return token ? `${parsedUrl.host}/...${token.slice(-8)}` : parsedUrl.host
  } catch {
    const token = url.split("/").filter(Boolean).at(-1) ?? ""
    return token ? `...${token.slice(-10)}` : "Ключ подписки"
  }
}
