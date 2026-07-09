"use client"

import type { ComponentProps } from "react"
import {
  BanknoteIcon,
  ChevronRightIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

type InviteItem = {
  createdAtLabel: string
  id: string
  statusLabel: string
  userLabel: string
}

type PayoutItem = {
  amountLabel: string
  createdAtLabel: string
  id: string
  statusLabel: string
}

type MetricConfig = {
  description: string
  icon: typeof UsersIcon
  items: InviteItem[] | PayoutItem[]
  kind: "invites" | "payouts"
  label: string
  title: string
  value: string
}

export function ReferralsMetrics({
  activeInvites,
  activeValue,
  invitedValue,
  invites,
  paidOutValue,
  payouts,
}: {
  activeInvites: InviteItem[]
  activeValue: string
  invitedValue: string
  invites: InviteItem[]
  paidOutValue: string
  payouts: PayoutItem[]
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
      description: "Заявки на вывод и их текущий статус.",
      icon: BanknoteIcon,
      items: payouts,
      kind: "payouts",
      label: "Выплачено",
      title: "Выплаты",
      value: paidOutValue,
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {metrics.map((metric) => (
        <MetricDisclosure key={metric.label} metric={metric} />
      ))}
    </div>
  )
}

function MetricDisclosure({ metric }: { metric: MetricConfig }) {
  const drawerTrigger = <MetricTrigger metric={metric} className="sm:hidden" />
  const dialogTrigger = (
    <MetricTrigger metric={metric} className="hidden sm:flex" />
  )
  return (
    <>
      <Drawer showSwipeHandle>
        <DrawerTrigger render={drawerTrigger} />
        <DrawerContent className="sm:hidden">
          <DrawerHeader>
            <DrawerTitle>{metric.title}</DrawerTitle>
            <DrawerDescription>{metric.description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4">
            <MetricDetails metric={metric} />
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog>
        <DialogTrigger render={dialogTrigger} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{metric.title}</DialogTitle>
            <DialogDescription>{metric.description}</DialogDescription>
          </DialogHeader>
          <MetricDetails metric={metric} />
        </DialogContent>
      </Dialog>
    </>
  )
}

function MetricTrigger({
  className,
  metric,
  ...props
}: {
  metric: MetricConfig
} & ComponentProps<"button">) {
  const Icon = metric.icon

  return (
    <button
      {...props}
      type="button"
      className={cn(
        "soft-panel group flex min-w-0 flex-col gap-2 p-3 text-left transition-colors hover:bg-card/55 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        <span className="truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          {metric.label}
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-lg leading-6 font-semibold">
          {metric.value}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      </span>
    </button>
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

  if (metric.kind === "payouts") {
    return (
      <div className="flex flex-col gap-2">
        {(metric.items as PayoutItem[]).map((payout) => (
          <div
            key={payout.id}
            className="soft-panel flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {payout.amountLabel}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {payout.createdAtLabel}
              </p>
            </div>
            <Badge variant="secondary">{payout.statusLabel}</Badge>
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
