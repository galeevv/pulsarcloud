"use client"

import * as React from "react"
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckIcon,
  CreditCardIcon,
  MinusIcon,
  PlusIcon,
  SmartphoneIcon,
  ZapIcon,
} from "lucide-react"

import { createPaymentAction } from "@/app/(dashboard)/actions"
import {
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
import { Switch } from "@/components/ui/switch"
import { formatRub } from "@/lib/pricing"

type PaymentSettings = {
  minDeviceLimit: number
  maxDeviceLimit: number
  baseMonthlyPriceRub: number
  extraDeviceMonthlyPriceRub: number
  lteMonthlyPriceRub: number
  durationDiscounts?: unknown
}

type CheckoutStep = "config" | "confirm"

type DurationOption = {
  months: number
  discountPct: number
}

const FALLBACK_DURATIONS: DurationOption[] = [
  { months: 1, discountPct: 0 },
  { months: 3, discountPct: 10 },
  { months: 6, discountPct: 15 },
  { months: 12, discountPct: 30 },
]

function getDurationOptions(settings: PaymentSettings) {
  const source = Array.isArray(settings.durationDiscounts)
    ? settings.durationDiscounts
    : FALLBACK_DURATIONS

  const parsed = source
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null
      }

      const maybeOption = item as {
        discountPct?: unknown
        months?: unknown
      }

      if (
        typeof maybeOption.months !== "number" ||
        typeof maybeOption.discountPct !== "number"
      ) {
        return null
      }

      return {
        months: maybeOption.months,
        discountPct: maybeOption.discountPct,
      }
    })
    .filter((item): item is DurationOption => Boolean(item))
    .sort((a, b) => a.months - b.months)

  return parsed.length ? parsed : FALLBACK_DURATIONS
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

function calculateTotal(
  settings: PaymentSettings,
  months: number,
  deviceLimit: number,
  lteEnabled: boolean
) {
  const duration =
    getDurationOptions(settings).find((item) => item.months === months) ??
    FALLBACK_DURATIONS[0]
  const normalizedDeviceLimit = Math.min(
    Math.max(deviceLimit, settings.minDeviceLimit),
    settings.maxDeviceLimit
  )
  const extraDevices = Math.max(0, normalizedDeviceLimit - 1)
  const monthly =
    settings.baseMonthlyPriceRub +
    extraDevices * settings.extraDeviceMonthlyPriceRub +
    (lteEnabled ? settings.lteMonthlyPriceRub : 0)
  const subtotal = monthly * months
  const total = Math.round(subtotal * (1 - duration.discountPct / 100))

  return {
    monthly,
    subtotal,
    total,
    discountPct: duration.discountPct,
  }
}

function calculatePriceBreakdown(
  settings: PaymentSettings,
  months: number,
  deviceLimit: number,
  lteEnabled: boolean,
  total: number
) {
  const duration =
    getDurationOptions(settings).find((item) => item.months === months) ??
    FALLBACK_DURATIONS[0]
  const normalizedDeviceLimit = Math.min(
    Math.max(deviceLimit, settings.minDeviceLimit),
    settings.maxDeviceLimit
  )
  const extraDevices = Math.max(0, normalizedDeviceLimit - 1)
  const discountMultiplier = 1 - duration.discountPct / 100
  const base = Math.round(
    settings.baseMonthlyPriceRub * months * discountMultiplier
  )
  const devices = Math.round(
    extraDevices *
      settings.extraDeviceMonthlyPriceRub *
      months *
      discountMultiplier
  )
  const lte = lteEnabled ? Math.max(0, total - base - devices) : 0

  return {
    base,
    devices,
    lte,
  }
}

function PriceBreakdownRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

function PaymentFlow({
  settings,
  testPaymentsEnabled,
}: {
  settings: PaymentSettings
  testPaymentsEnabled: boolean
}) {
  const durations = React.useMemo(
    () => getDurationOptions(settings),
    [settings]
  )
  const defaultDeviceLimit = Math.min(
    Math.max(3, settings.minDeviceLimit),
    settings.maxDeviceLimit
  )
  const [step, setStep] = React.useState<CheckoutStep>("config")
  const [months, setMonths] = React.useState(durations[0]?.months ?? 1)
  const [deviceLimit, setDeviceLimit] = React.useState(defaultDeviceLimit)
  const [lteEnabled, setLteEnabled] = React.useState(false)
  const [idempotencyKey] = React.useState(() => crypto.randomUUID())
  const price = calculateTotal(settings, months, deviceLimit, lteEnabled)
  const priceBreakdown = calculatePriceBreakdown(
    settings,
    months,
    deviceLimit,
    lteEnabled,
    price.total
  )

  function changeDeviceLimit(nextValue: number) {
    setDeviceLimit(
      Math.min(
        Math.max(nextValue, settings.minDeviceLimit),
        settings.maxDeviceLimit
      )
    )
  }

  return (
    <form action={createPaymentAction} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="months" value={months} />
      <input type="hidden" name="deviceLimit" value={deviceLimit} />
      <input type="hidden" name="lteEnabled" value={lteEnabled ? "on" : ""} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 sm:px-1 sm:pt-0">
        <div className="flex flex-col gap-4">
          {step === "config" ? (
            <>
              <div className="flex flex-col gap-2">
                {durations.map((duration) => {
                  const durationPrice = calculateTotal(
                    settings,
                    duration.months,
                    deviceLimit,
                    lteEnabled
                  )
                  const isActive = months === duration.months

                  return (
                    <Button
                      key={duration.months}
                      type="button"
                      variant={isActive ? "secondary" : "outline"}
                      className="h-auto w-full justify-between rounded-[18px] px-3 py-3"
                      onClick={() => setMonths(duration.months)}
                    >
                      <span className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-left">
                        <span className="font-medium">
                          {getMonthsLabel(duration.months)}
                        </span>
                        <span className="text-right font-semibold">
                          {formatRub(durationPrice.total)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRub(
                            Math.round(
                              durationPrice.total / Math.max(1, duration.months)
                            )
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
                    </Button>
                  )
                })}
              </div>

              <div className="soft-panel flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/40">
                    <SmartphoneIcon />
                  </div>
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
                    className="grid place-items-center p-0"
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
                    className="grid place-items-center p-0"
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
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/40">
                    <ZapIcon />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">LTE-доступ</p>
                      <Badge variant="secondary">
                        +{formatRub(settings.lteMonthlyPriceRub)} / месяц
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
              <div className="soft-panel flex flex-col gap-2 p-4">
                <PriceBreakdownRow
                  icon={CalendarDaysIcon}
                  label={getMonthsLabel(months)}
                  value={formatRub(priceBreakdown.base)}
                />
                <PriceBreakdownRow
                  icon={SmartphoneIcon}
                  label={getDeviceLabel(deviceLimit)}
                  value={formatRub(priceBreakdown.devices)}
                />
                <PriceBreakdownRow
                  icon={ZapIcon}
                  label={`LTE-доступ ${lteEnabled ? "есть" : "нет"}`}
                  value={formatRub(priceBreakdown.lte)}
                />
              </div>

              <div className="rounded-[22px] border border-border/70 bg-primary px-4 py-4 text-primary-foreground">
                <p className="text-sm opacity-75">К оплате</p>
                <p className="text-3xl font-semibold tracking-normal">
                  {formatRub(price.total)}
                </p>
                {price.discountPct > 0 ? (
                  <p className="mt-1 text-sm opacity-75">
                    Скидка за срок: {price.discountPct}%
                  </p>
                ) : null}
              </div>
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
            <CreditCardIcon data-icon="inline-start" />
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
              onClick={() => setStep("config")}
            >
              <ArrowLeftIcon />
            </Button>
            <Button
              type="submit"
              name="paymentMode"
              value="live"
              size="lg"
              className={pulsarControlClass}
            >
              <CheckIcon data-icon="inline-start" />
              Создать платёж
            </Button>
            {testPaymentsEnabled ? (
              <Button
                type="submit"
                name="paymentMode"
                value="test"
                size="lg"
                variant="outline"
                className="col-span-2"
              >
                Оплатить тестовыми кредитами
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </form>
  )
}

export function SubscriptionPaymentAction({
  settings,
  testPaymentsEnabled = false,
  triggerLabel,
}: {
  settings: PaymentSettings
  testPaymentsEnabled?: boolean
  triggerLabel: string
}) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  React.useEffect(() => {
    function openPaymentCheckout() {
      if (window.matchMedia("(min-width: 640px)").matches) {
        setIsDialogOpen(true)
        return
      }

      setIsDrawerOpen(true)
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
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        showSwipeHandle
        swipeDirection="down"
      >
        <DrawerTrigger
          render={
            <Button
              type="button"
              size="lg"
              className={`${pulsarCtaClass} sm:hidden`}
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
              Настройте параметры подписки перед оплатой.
            </DrawerDescription>
          </DrawerHeader>
          <PaymentFlow
            settings={settings}
            testPaymentsEnabled={testPaymentsEnabled}
          />
        </DrawerContent>
      </Drawer>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              size="lg"
              className={`hidden ${pulsarCtaClass} sm:inline-flex`}
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
              Настройте параметры подписки перед оплатой.
            </DialogDescription>
          </DialogHeader>
          <PaymentFlow
            settings={settings}
            testPaymentsEnabled={testPaymentsEnabled}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
