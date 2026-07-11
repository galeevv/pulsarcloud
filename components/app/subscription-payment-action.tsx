"use client"

import * as React from "react"
import {
  ArrowLeftIcon,
  CheckIcon,
  CreditCardIcon,
  MinusIcon,
  PlusIcon,
  SmartphoneIcon,
  ZapIcon,
} from "lucide-react"

import { PreviewForm } from "@/components/frontend-preview/preview-form"
import {
  pulsarCtaClass,
  pulsarControlClass,
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
import { formatPreviewRub } from "@/src/frontend-preview/format"
import type { PreviewPricing } from "@/src/frontend-preview/view-models"

type CheckoutStep = "config" | "confirm"

function getMonthsLabel(months: number) {
  return `${months} ${months === 1 ? "месяц" : months < 5 ? "месяца" : "месяцев"}`
}

function PaymentFlow({ settings }: { settings: PreviewPricing }) {
  const [step, setStep] = React.useState<CheckoutStep>("config")
  const [months, setMonths] = React.useState(
    settings.durationOptions[0]?.months ?? 1
  )
  const [deviceLimit, setDeviceLimit] = React.useState(
    Math.min(Math.max(3, settings.minDeviceLimit), settings.maxDeviceLimit)
  )
  const [lteEnabled, setLteEnabled] = React.useState(false)
  const selectedDuration =
    settings.durationOptions.find((item) => item.months === months) ??
    settings.durationOptions[0]

  function changeDeviceLimit(nextValue: number) {
    setDeviceLimit(
      Math.min(
        Math.max(nextValue, settings.minDeviceLimit),
        settings.maxDeviceLimit
      )
    )
  }

  return (
    <PreviewForm className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 sm:px-1 sm:pt-0">
        <div className="flex flex-col gap-4">
          {step === "config" ? (
            <>
              <div className="flex flex-col gap-2">
                {settings.durationOptions.map((duration) => (
                  <Button
                    key={duration.months}
                    type="button"
                    variant={
                      months === duration.months ? "secondary" : "outline"
                    }
                    className="h-auto w-full justify-between rounded-[18px] px-3 py-3"
                    onClick={() => setMonths(duration.months)}
                  >
                    <span className="grid min-w-0 flex-1 grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-left">
                      <span className="font-medium">
                        {getMonthsLabel(duration.months)}
                      </span>
                      <span className="text-right font-semibold">
                        {formatPreviewRub(duration.totalRub)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Предпросмотр тарифа
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
                ))}
              </div>

              <div className="soft-panel flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/40">
                    <SmartphoneIcon />
                  </div>
                  <div>
                    <p className="font-medium">Устройства</p>
                    <p className="text-sm text-muted-foreground">
                      {deviceLimit} устройства
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

              <div className="soft-panel flex items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/40">
                    <ZapIcon />
                  </div>
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
                  onCheckedChange={setLteEnabled}
                />
              </div>
            </>
          ) : (
            <>
              <div className="soft-panel flex flex-col gap-2 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    {getMonthsLabel(months)}
                  </span>
                  <span>
                    {selectedDuration
                      ? formatPreviewRub(selectedDuration.totalRub)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Устройства</span>
                  <span>{deviceLimit}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">LTE-доступ</span>
                  <span>{lteEnabled ? "есть" : "нет"}</span>
                </div>
              </div>
              <div className="rounded-[22px] border border-border/70 bg-primary px-4 py-4 text-primary-foreground">
                <p className="text-sm opacity-75">Предпросмотр</p>
                <p className="text-xl font-semibold tracking-normal">
                  Backend не подключен
                </p>
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
            <Button type="submit" size="lg" className={pulsarControlClass}>
              <CheckIcon data-icon="inline-start" />
              Создать платёж
            </Button>
          </div>
        )}
      </div>
    </PreviewForm>
  )
}

export function SubscriptionPaymentAction({
  settings,
  triggerLabel,
}: {
  settings: PreviewPricing
  triggerLabel: string
}) {
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  React.useEffect(() => {
    function openPaymentCheckout() {
      if (window.matchMedia("(min-width: 640px)").matches) {
        setIsDialogOpen(true)
      } else {
        setIsDrawerOpen(true)
      }
    }

    window.addEventListener(
      "pulsar:open-subscription-payment",
      openPaymentCheckout
    )
    return () =>
      window.removeEventListener(
        "pulsar:open-subscription-payment",
        openPaymentCheckout
      )
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
          <PaymentFlow settings={settings} />
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
          <PaymentFlow settings={settings} />
        </DialogContent>
      </Dialog>
    </>
  )
}
