"use client"

import {
  ChartNoAxesCombinedIcon,
  GiftIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react"

import { PulsarActionRow } from "@/components/app/pulsar-primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type InviteItem = {
  createdAtLabel: string
  id: string
  statusLabel: string
  userLabel: string
}

type RewardItem = {
  createdAtLabel: string
  daysLabel: string
  id: string
  userLabel: string
}

type MetricConfig = {
  description: string
  icon: typeof UsersIcon
  items: InviteItem[] | RewardItem[]
  kind: "invites" | "rewards"
  label: string
  title: string
  value: string
}

export function ReferralsMetrics({
  activeInvites,
  activeValue,
  friendTrialLabel,
  invitedValue,
  invites,
  ownerRewardDays,
  earnedDays,
  rewards,
}: {
  activeInvites: InviteItem[]
  activeValue: string
  friendTrialLabel: string
  invitedValue: string
  invites: InviteItem[]
  ownerRewardDays: number
  earnedDays: number
  rewards: RewardItem[]
}) {
  const metrics: MetricConfig[] = [
    {
      description: "Все пользователи, которые перешли по вашей ссылке.",
      icon: UsersIcon,
      items: invites,
      kind: "invites",
      label: "Приглашено",
      title: "Приглашенные",
      value: invitedValue,
    },
    {
      description: "Приглашенные пользователи, которые уже оплатили Pulsar.",
      icon: UserCheckIcon,
      items: activeInvites,
      kind: "invites",
      label: "Активных",
      title: "Активные",
      value: activeValue,
    },
    {
      description: "Дни подписки, начисленные за активных друзей.",
      icon: GiftIcon,
      items: rewards,
      kind: "rewards",
      label: "Награды",
      title: "Награды",
      value: String(earnedDays),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <section
        className="flex flex-col gap-2"
        aria-labelledby="conditions-title"
      >
        <h2 id="conditions-title" className="text-[16px] font-semibold">
          Условия и бонусы
        </h2>
        <div className="flex flex-col gap-3">
          <ConditionsCard
            friendTrialLabel={friendTrialLabel}
            ownerRewardDays={ownerRewardDays}
          />
          <RewardsCard
            earnedDays={earnedDays}
            rewardedFriendsCount={rewards.length}
          />
        </div>
      </section>
      <Separator />
      <AnalyticsDisclosure metrics={metrics} />
    </div>
  )
}

function ConditionsCard({
  friendTrialLabel,
  ownerRewardDays,
}: {
  friendTrialLabel: string
  ownerRewardDays: number
}) {
  return (
    <PulsarActionRow
      icon={UsersIcon}
      title={`Другу ${friendTrialLabel} бесплатно.`}
      titleClassName="font-normal text-foreground"
      description={`Вам +${formatBonusDaysLabel(ownerRewardDays)}.`}
      descriptionClassName="text-foreground"
    />
  )
}

function RewardsCard({
  earnedDays,
  rewardedFriendsCount,
}: {
  earnedDays: number
  rewardedFriendsCount: number
}) {
  return (
    <PulsarActionRow
      icon={GiftIcon}
      title={`Вы получили ${formatBonusDaysLabel(earnedDays)}.`}
      titleClassName="font-normal text-foreground"
      description={`За ${formatInvitedFriendsLabel(rewardedFriendsCount)}.`}
      descriptionClassName="text-foreground"
    />
  )
}

function formatBonusDaysLabel(days: number) {
  return `${days} ${pluralizeRu(days, [
    "бонусный день",
    "бонусных дня",
    "бонусных дней",
  ])}`
}

function formatInvitedFriendsLabel(count: number) {
  return `${count} ${pluralizeRu(count, [
    "приглашённого друга",
    "приглашённых друзей",
    "приглашённых друзей",
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

function AnalyticsDisclosure({ metrics }: { metrics: MetricConfig[] }) {
  const drawerTrigger = (
    <Button
      type="button"
      size="lg"
      variant="outline"
      className="h-11 w-full rounded-[18px] sm:hidden"
    >
      <ChartNoAxesCombinedIcon data-icon="inline-start" />
      Детальная аналитика
    </Button>
  )
  const dialogTrigger = (
    <Button
      type="button"
      size="lg"
      variant="outline"
      className="hidden h-11 w-full rounded-[18px] sm:inline-flex"
    >
      <ChartNoAxesCombinedIcon data-icon="inline-start" />
      Детальная аналитика
    </Button>
  )

  return (
    <>
      <Drawer showSwipeHandle>
        <DrawerTrigger render={drawerTrigger} />
        <DrawerContent className="sm:hidden">
          <DrawerHeader>
            <DrawerTitle>Детальная аналитика</DrawerTitle>
          </DrawerHeader>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4">
            <AnalyticsContent metrics={metrics} />
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog>
        <DialogTrigger render={dialogTrigger} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Детальная аналитика</DialogTitle>
          </DialogHeader>
          <AnalyticsContent metrics={metrics} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function AnalyticsContent({ metrics }: { metrics: MetricConfig[] }) {
  return (
    <Tabs defaultValue={`${metrics[0]?.kind ?? "invites"}-0`}>
      <TabsList className="grid w-full grid-cols-3">
        {metrics.map((metric, index) => (
          <TabsTrigger
            key={metric.label}
            value={`${metric.kind}-${index}`}
            aria-label={`${metric.label}: ${metric.value}`}
          >
            <span className="truncate">{metric.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {metrics.map((metric, index) => (
        <TabsContent
          key={metric.label}
          value={`${metric.kind}-${index}`}
          className="flex flex-col gap-3 pt-2"
        >
          <div>
            <p className="text-base font-semibold">
              {metric.title}: {metric.value}
            </p>
            <p className="text-sm text-muted-foreground">
              {metric.description}
            </p>
          </div>
          <MetricDetails metric={metric} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function MetricDetails({ metric }: { metric: MetricConfig }) {
  if (metric.items.length === 0) {
    return (
      <div className="soft-panel p-4 text-sm text-muted-foreground">
        Пока нет данных.
      </div>
    )
  }

  if (metric.kind === "rewards") {
    return (
      <div className="flex flex-col gap-2">
        {(metric.items as RewardItem[]).map((reward) => (
          <div
            key={reward.id}
            className="soft-panel flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{reward.userLabel}</p>
              <p className="truncate text-xs text-muted-foreground">
                {reward.createdAtLabel}
              </p>
            </div>
            <Badge variant="secondary">{reward.daysLabel}</Badge>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {(metric.items as InviteItem[]).map((invite) => (
        <div
          key={invite.id}
          className="soft-panel flex items-center justify-between gap-3 p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{invite.userLabel}</p>
            <p className="truncate text-xs text-muted-foreground">
              {invite.createdAtLabel}
            </p>
          </div>
          <Badge variant="secondary">{invite.statusLabel}</Badge>
        </div>
      ))}
    </div>
  )
}
