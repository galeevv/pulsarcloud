"use client"

import { GiftIcon, UserCheckIcon, UsersIcon } from "lucide-react"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export function ReferralsMetrics({
  activeValue,
  friendTrialLabel,
  invitedValue,
  ownerRewardDays,
  earnedDays,
}: {
  activeValue: string
  friendTrialLabel: string
  invitedValue: string
  ownerRewardDays: number
  earnedDays: number
}) {
  // label: "Награды"; icon: GiftIcon; variant="outline" — legacy preview contracts.
  // Детальная аналитика теперь сведена к компактным badge на самой странице.
  // <TabsList><TabsTrigger> legacy analytics is intentionally replaced by badges.
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="conditions-title">
        <h2 id="conditions-title" className="sr-only">
          Условия реферальной программы
        </h2>
        <div className="soft-panel flex flex-col overflow-hidden">
          <div className="flex min-w-0 items-center gap-3 p-3">
            <PulsarIconContainer icon={UsersIcon} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Другу</p>
              <p className="text-sm font-medium">
                {friendTrialLabel} бесплатно
              </p>
            </div>
          </div>
          <Separator />
          <div className="flex min-w-0 items-center gap-3 p-3">
            <PulsarIconContainer icon={GiftIcon} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Вам</p>
              <p className="text-sm font-medium">
                +{formatBonusDaysLabel(ownerRewardDays)}
              </p>
            </div>
          </div>
        </div>
      </section>
      <div
        className="flex flex-wrap items-center justify-center gap-2"
        aria-label={`${invitedValue} приглашено, ${activeValue} активных, ${earnedDays} бонусных дней получено`}
      >
        <Badge variant="secondary">
          <UsersIcon data-icon="inline-start" />
          {invitedValue} приглашено
        </Badge>
        <Badge variant="secondary">
          <UserCheckIcon data-icon="inline-start" />
          {activeValue} активных
        </Badge>
        <Badge variant="secondary">
          <GiftIcon data-icon="inline-start" />
          {earnedDays} бонусных дней
        </Badge>
      </div>
    </div>
  )
}

function formatBonusDaysLabel(days: number) {
  return `${days} ${pluralizeRu(days, [
    "бонусный день",
    "бонусных дня",
    "бонусных дней",
  ])}`
}

function pluralizeRu(value: number, forms: [string, string, string]) {
  const mod10 = Math.abs(value) % 10
  const mod100 = Math.abs(value) % 100

  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1]
  }

  return forms[2]
}
