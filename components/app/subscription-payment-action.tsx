"use client"

import * as React from "react"
import {
  CreditCardIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  SmartphoneIcon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"
import { pulsarCtaClass } from "@/components/app/pulsar-primitives"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import type { PreviewPricing } from "@/src/frontend-preview/view-models"
import { cn } from "@/lib/utils"

function PaymentFlow({
  settings,
  initialDeviceLimit,
  initialLteEnabled,
  renewsActiveSubscription,
}: {
  settings: PreviewPricing
  initialDeviceLimit?: number
  initialLteEnabled?: boolean
  renewsActiveSubscription?: boolean
}) {
  const [months, setMonths] = React.useState(
    settings.durationOptions[0]?.months ?? 1
  )
  const [deviceLimit, setDeviceLimit] = React.useState(
    initialDeviceLimit ?? settings.minDeviceLimit
  )
  const [lteEnabled, setLteEnabled] = React.useState(initialLteEnabled ?? false)
  const [pending, setPending] = React.useState(false)
  const idempotencyKey = React.useRef("")
  React.useEffect(() => {
    idempotencyKey.current = ""
  }, [months, deviceLimit, lteEnabled])
  const duration =
    settings.durationOptions.find((item) => item.months === months) ??
    settings.durationOptions[0]
  const monthlyExtras =
    Math.max(0, deviceLimit - settings.minDeviceLimit) *
      settings.extraDeviceMonthlyPriceRub +
    (lteEnabled ? settings.lteMonthlyPriceRub : 0)
  const totalRub = duration
    ? Math.round(
        (duration.totalRub +
          monthlyExtras * months * (1 - duration.discountPct / 100)) *
          100
      ) / 100
    : 0

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    idempotencyKey.current ||= globalThis.crypto.randomUUID()
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMonths: months,
          deviceLimit,
          lteEnabled,
          idempotencyKey: idempotencyKey.current,
        }),
      })
      const result = (await response.json()) as {
        checkoutUrl?: string
        error?: string
        message?: string
      }
      if (!response.ok || !result.checkoutUrl) {
        const message =
          result.error === "SUBSCRIPTION_UPGRADE_REQUIRES_PAYMENT"
            ? "Параметры активного периода нельзя изменить мгновенно. Оформите полное продление — новые параметры вступят в силу после его окончания."
            : (result.message ?? "Не удалось создать платёж.")
        throw new Error(message)
      }
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось создать платёж."
      )
      setPending(false)
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4 sm:px-1 sm:pt-0">
        <ToggleGroup
          value={[String(months)]}
          onValueChange={(values) => values[0] && setMonths(Number(values[0]))}
          className="grid w-full grid-cols-2"
          aria-label="Срок подписки"
        >
          {settings.durationOptions.map((item) => (
            <ToggleGroupItem
              key={item.months}
              value={String(item.months)}
              variant="outline"
              className="h-auto min-h-14 flex-col items-start px-3 py-2"
            >
              <span>{item.months} мес.</span>
              <span className="text-xs text-muted-foreground">
                {formatPreviewRub(item.totalRub)}{" "}
                {item.discountPct ? `· −${item.discountPct}%` : ""}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {renewsActiveSubscription ? (
          <Alert>
            <InfoIcon />
            <AlertTitle>Параметры следующего периода</AlertTitle>
            <AlertDescription>
              Продление начнётся после текущей подписки. Выбранные лимит
              устройств и LTE вступят в силу в новом периоде.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="soft-panel flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <SmartphoneIcon />
            <div>
              <p className="font-medium">Устройства</p>
              <p className="text-sm text-muted-foreground">
                {deviceLimit} из {settings.maxDeviceLimit}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Уменьшить лимит"
              disabled={deviceLimit <= settings.minDeviceLimit}
              onClick={() => setDeviceLimit((value) => value - 1)}
            >
              <MinusIcon />
            </Button>
            <span className="w-6 text-center text-sm font-semibold">
              {deviceLimit}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Увеличить лимит"
              disabled={deviceLimit >= settings.maxDeviceLimit}
              onClick={() => setDeviceLimit((value) => value + 1)}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>
        <div className="soft-panel flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <ZapIcon />
            <div>
              <p className="font-medium">LTE-доступ</p>
              <Badge variant="secondary">
                +{formatPreviewRub(settings.lteMonthlyPriceRub)} / мес.
              </Badge>
            </div>
          </div>
          <Switch
            checked={lteEnabled}
            onCheckedChange={setLteEnabled}
            aria-label="Подключить LTE-доступ"
          />
        </div>
        <div className="rounded-[22px] border border-border/70 bg-primary px-4 py-4 text-primary-foreground">
          <p className="text-sm opacity-75">К оплате</p>
          <p className="text-xl font-semibold">{formatPreviewRub(totalRub)}</p>
        </div>
      </div>
      <div className="border-t border-border/70 p-4 sm:px-0 sm:pb-0">
        <Button
          type="submit"
          size="lg"
          className={pulsarCtaClass}
          disabled={pending}
        >
          <CreditCardIcon data-icon="inline-start" />
          {pending ? "Создаём платёж…" : "Перейти к оплате"}
        </Button>
      </div>
    </form>
  )
}

export function SubscriptionPaymentAction({
  settings,
  triggerLabel,
  initialDeviceLimit,
  initialLteEnabled,
  renewsActiveSubscription = false,
}: {
  settings: PreviewPricing
  triggerLabel: string
  initialDeviceLimit?: number
  initialLteEnabled?: boolean
  renewsActiveSubscription?: boolean
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  React.useEffect(() => {
    const open = () =>
      window.matchMedia("(min-width: 640px)").matches
        ? setDialogOpen(true)
        : setDrawerOpen(true)
    window.addEventListener("pulsar:open-subscription-payment", open)
    return () =>
      window.removeEventListener("pulsar:open-subscription-payment", open)
  }, [])
  return (
    <>
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        showSwipeHandle
        swipeDirection="down"
      >
        <DrawerTrigger
          render={
            <Button
              type="button"
              size="lg"
              className={cn(pulsarCtaClass, "sm:hidden")}
            />
          }
        >
          <CreditCardIcon data-icon="inline-start" />
          {triggerLabel}
        </DrawerTrigger>
        <DrawerContent className="sm:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>{triggerLabel}</DrawerTitle>
            <DrawerDescription>
              Настройте подписку перед оплатой.
            </DrawerDescription>
          </DrawerHeader>
          <PaymentFlow
            settings={settings}
            initialDeviceLimit={initialDeviceLimit}
            initialLteEnabled={initialLteEnabled}
            renewsActiveSubscription={renewsActiveSubscription}
          />
        </DrawerContent>
      </Drawer>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              size="lg"
              className={cn("hidden sm:inline-flex", pulsarCtaClass)}
            />
          }
        >
          <CreditCardIcon data-icon="inline-start" />
          {triggerLabel}
        </DialogTrigger>
        <DialogContent className="flex max-h-[88svh] flex-col overflow-hidden p-4 sm:max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>{triggerLabel}</DialogTitle>
            <DialogDescription>
              Настройте подписку перед оплатой.
            </DialogDescription>
          </DialogHeader>
          <PaymentFlow
            settings={settings}
            initialDeviceLimit={initialDeviceLimit}
            initialLteEnabled={initialLteEnabled}
            renewsActiveSubscription={renewsActiveSubscription}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
