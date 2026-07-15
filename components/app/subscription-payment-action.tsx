"use client"

import * as React from "react"
import {
  ArrowLeftIcon,
  CreditCardIcon,
  LandmarkIcon,
  MinusIcon,
  PlusIcon,
  SmartphoneIcon,
  WalletCardsIcon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  PulsarIconContainer,
  pulsarControlClass,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatPreviewRub } from "@/src/frontend-preview/format"
import type { PreviewPricing } from "@/src/frontend-preview/view-models"
import { cn } from "@/lib/utils"

type CheckoutStep = "config" | "confirm"
type PaymentMethod = "SBP" | "WALLET"

function getDefaultDeviceLimit(settings: PreviewPricing) {
  return Math.min(Math.max(3, settings.minDeviceLimit), settings.maxDeviceLimit)
}

function clampDeviceLimit(value: number | undefined, settings: PreviewPricing) {
  return Math.min(
    Math.max(value ?? getDefaultDeviceLimit(settings), settings.minDeviceLimit),
    settings.maxDeviceLimit
  )
}

function getMonthsLabel(months: number) {
  if (months === 1) {
    return "1 месяц"
  }

  if (months >= 2 && months <= 4) {
    return `${months} месяца`
  }

  return `${months} месяцев`
}

function getDeviceLabel(deviceLimit: number) {
  const mod10 = deviceLimit % 10
  const mod100 = deviceLimit % 100

  if (mod10 === 1 && mod100 !== 11) {
    return `${deviceLimit} устройство`
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${deviceLimit} устройства`
  }

  return `${deviceLimit} устройств`
}

function getSelectedDuration(settings: PreviewPricing, months: number) {
  return (
    settings.durationOptions.find((item) => item.months === months) ??
    settings.durationOptions[0]
  )
}

function calculatePrice(
  settings: PreviewPricing,
  months: number,
  deviceLimit: number,
  lteEnabled: boolean
) {
  const duration = getSelectedDuration(settings, months)
  const extraDevices = Math.max(0, deviceLimit - settings.minDeviceLimit)
  const subtotalMinor =
    Math.round(settings.baseMonthlyPriceRub * 100) * months +
    extraDevices *
      Math.round(settings.extraDeviceMonthlyPriceRub * 100) *
      months +
    (lteEnabled ? Math.round(settings.lteMonthlyPriceRub * 100) * months : 0)
  const durationDiscountMinor = Math.round(
    (subtotalMinor * (duration?.discountPct ?? 0)) / 100
  )
  const totalMinor =
    Math.round((subtotalMinor - durationDiscountMinor) / 100) * 100

  return {
    discountPct: duration?.discountPct ?? 0,
    originalTotal: subtotalMinor / 100,
    totalMinor,
    total: totalMinor / 100,
  }
}

function PaymentFlow({
  settings,
  initialDeviceLimit,
  initialLteEnabled,
  walletBalanceRub,
}: {
  settings: PreviewPricing
  initialDeviceLimit?: number
  initialLteEnabled?: boolean
  walletBalanceRub: number
}) {
  const [step, setStep] = React.useState<CheckoutStep>("config")
  const [months, setMonths] = React.useState(
    settings.durationOptions[0]?.months ?? 1
  )
  const [deviceLimit, setDeviceLimit] = React.useState(
    clampDeviceLimit(initialDeviceLimit, settings)
  )
  const [lteEnabled, setLteEnabled] = React.useState(initialLteEnabled ?? true)
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>("SBP")
  const [pending, setPending] = React.useState(false)
  const idempotencyKey = React.useRef("")
  const price = calculatePrice(settings, months, deviceLimit, lteEnabled)

  React.useEffect(() => {
    idempotencyKey.current = ""
  }, [months, deviceLimit, lteEnabled, paymentMethod])

  function changeDeviceLimit(nextValue: number) {
    setDeviceLimit(
      Math.min(
        Math.max(nextValue, settings.minDeviceLimit),
        settings.maxDeviceLimit
      )
    )
  }

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
          paymentMethod,
          expectedAmountMinor: price.totalMinor,
          pricingVersion: settings.pricingVersion,
          idempotencyKey: idempotencyKey.current,
        }),
      })
      const result = (await response.json()) as {
        checkoutUrl?: string
        error?: string
        message?: string
      }

      if (!response.ok || !result.checkoutUrl)
        throw new Error(result.message ?? "Не удалось создать платеж.")

      window.location.assign(result.checkoutUrl)
    } catch (error) {
      idempotencyKey.current = ""
      toast.error(
        error instanceof Error ? error.message : "Не удалось создать платеж."
      )
      setPending(false)
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 sm:px-1 sm:pt-0">
        <div className="flex flex-col gap-4">
          {step === "config" ? (
            <>
              <ToggleGroup
                value={[String(months)]}
                onValueChange={(values) => {
                  if (values[0]) {
                    setMonths(Number(values[0]))
                  }
                }}
                orientation="vertical"
                variant="outline"
                spacing={2}
                className="w-full items-stretch"
                aria-label="Срок подписки"
              >
                {settings.durationOptions.map((duration) => {
                  const durationPrice = calculatePrice(
                    settings,
                    duration.months,
                    deviceLimit,
                    lteEnabled
                  )

                  return (
                    <ToggleGroupItem
                      key={duration.months}
                      value={String(duration.months)}
                      className="h-auto w-full justify-between rounded-[18px] px-3 py-3 text-left data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground"
                    >
                      <span className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                        <span className="font-medium">
                          {getMonthsLabel(duration.months)}
                        </span>
                        <span className="text-right font-semibold">
                          {formatPreviewRub(durationPrice.total)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatPreviewRub(
                            durationPrice.total / duration.months
                          )}{" "}
                          / месяц
                        </span>
                        <span className="flex justify-end">
                          {duration.discountPct > 0 ? (
                            <Badge variant="secondary">
                              -{duration.discountPct}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              базовый
                            </span>
                          )}
                        </span>
                      </span>
                    </ToggleGroupItem>
                  )
                })}
              </ToggleGroup>

              <div className="soft-panel flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <PulsarIconContainer icon={SmartphoneIcon} size="md" />
                  <div>
                    <p className="font-medium">Устройства</p>
                    <p className="text-sm text-muted-foreground">
                      {getDeviceLabel(deviceLimit)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="Уменьшить лимит устройств"
                    disabled={deviceLimit <= settings.minDeviceLimit}
                    onClick={() => changeDeviceLimit(deviceLimit - 1)}
                  >
                    <MinusIcon />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {deviceLimit}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label="Увеличить лимит устройств"
                    disabled={deviceLimit >= settings.maxDeviceLimit}
                    onClick={() => changeDeviceLimit(deviceLimit + 1)}
                  >
                    <PlusIcon />
                  </Button>
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                className="soft-panel flex cursor-pointer items-center justify-between gap-4 p-4 transition-colors hover:bg-card/55 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
                onClick={() => setLteEnabled((current) => !current)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setLteEnabled((current) => !current)
                  }
                }}
              >
                <div className="flex min-w-0 gap-3">
                  <PulsarIconContainer icon={ZapIcon} size="md" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">LTE-доступ</p>
                      <Badge variant="secondary">
                        +{formatPreviewRub(settings.lteMonthlyPriceRub)} / месяц
                      </Badge>
                    </div>
                    <p className="truncate text-sm leading-5 text-muted-foreground">
                      Стабильнее с мобильного интернета.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={lteEnabled}
                  aria-label="Подключить LTE-доступ"
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={setLteEnabled}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {price.discountPct > 0 ? (
                  <Badge variant="secondary">
                    Скидка за срок {price.discountPct}%
                  </Badge>
                ) : null}
              </div>

              <RadioGroup
                value={paymentMethod}
                onValueChange={(value) =>
                  setPaymentMethod(value as PaymentMethod)
                }
                aria-label="Способ оплаты"
              >
                <label className="soft-panel flex cursor-pointer items-center gap-3 p-4 has-[[data-checked]]:border-primary/60 has-[[data-checked]]:bg-secondary/70">
                  <RadioGroupItem value="SBP" />
                  <PulsarIconContainer icon={LandmarkIcon} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">СБП</span>
                    <span className="block text-sm text-muted-foreground">
                      Быстрая оплата через банк
                    </span>
                  </span>
                </label>
                <label
                  className={cn(
                    "soft-panel flex items-center gap-3 p-4 has-[[data-checked]]:border-primary/60 has-[[data-checked]]:bg-secondary/70",
                    walletBalanceRub >= price.total
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-60"
                  )}
                >
                  <RadioGroupItem
                    value="WALLET"
                    disabled={walletBalanceRub < price.total}
                  />
                  <PulsarIconContainer icon={WalletCardsIcon} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">Внутренний баланс</span>
                    <span className="block text-sm text-muted-foreground">
                      Доступно {formatPreviewRub(walletBalanceRub)}
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 p-4 sm:px-0 sm:pb-0">
        {step === "config" ? (
          <Button
            type="button"
            size="lg"
            className={pulsarCtaClass}
            onClick={() => setStep("confirm")}
          >
            Продолжить
          </Button>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button
              type="button"
              size="lg"
              variant="outline"
              className={pulsarControlClass}
              aria-label="Вернуться к настройкам"
              disabled={pending}
              onClick={() => {
                setPaymentMethod("SBP")
                setStep("config")
              }}
            >
              <ArrowLeftIcon />
            </Button>
            <Button
              type="submit"
              size="lg"
              className={pulsarControlClass}
              disabled={pending}
            >
              {pending ? (
                "Создаем платеж..."
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {price.originalTotal > price.total ? (
                    <span className="text-primary-foreground/65 line-through">
                      {formatPreviewRub(price.originalTotal)}
                    </span>
                  ) : null}
                  <span>{formatPreviewRub(price.total)}</span>
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    </form>
  )
}

export function SubscriptionPaymentAction({
  settings,
  walletBalanceRub,
  triggerLabel,
  initialDeviceLimit,
  initialLteEnabled,
}: {
  settings: PreviewPricing
  walletBalanceRub: number
  triggerLabel: string
  initialDeviceLimit?: number
  initialLteEnabled?: boolean
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  React.useEffect(() => {
    function openPaymentCheckout() {
      if (window.matchMedia("(min-width: 640px)").matches) {
        setDialogOpen(true)
        return
      }

      setDrawerOpen(true)
    }

    window.addEventListener(
      "pulsar:open-subscription-payment",
      openPaymentCheckout
    )

    return () => {
      window.removeEventListener(
        "pulsar:open-subscription-payment",
        openPaymentCheckout
      )
    }
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
            walletBalanceRub={walletBalanceRub}
            initialDeviceLimit={initialDeviceLimit}
            initialLteEnabled={initialLteEnabled}
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
            walletBalanceRub={walletBalanceRub}
            initialDeviceLimit={initialDeviceLimit}
            initialLteEnabled={initialLteEnabled}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
