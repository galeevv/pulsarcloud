"use client"

import * as React from "react"
import {
  CircleDashedIcon,
  PlusIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  PulsarActionRow,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatPreviewRub } from "@/src/frontend-preview/format"

type SubscriberDevice = {
  hwid: string
  platform: string | null
  osVersion: string | null
  deviceModel: string | null
  userAgent: string | null
  createdAt: string
  updatedAt: string
}

type SubscriptionDevicesCardProps = {
  deviceLimit: number
  maxDeviceLimit: number
  deviceLimitUpgradePriceRub: number
  pricingVersion: number
}

function formatDeviceCountAfterPreposition(count: number) {
  const absoluteCount = Math.abs(count)
  const lastTwoDigits = absoluteCount % 100
  const lastDigit = absoluteCount % 10
  const noun =
    lastDigit === 1 && lastTwoDigits !== 11 ? "устройства" : "устройств"

  return `${count} ${noun}`
}

export function SubscriptionDevicesCard({
  deviceLimit,
  maxDeviceLimit,
  deviceLimitUpgradePriceRub,
  pricingVersion,
}: SubscriptionDevicesCardProps) {
  const [devices, setDevices] = React.useState<SubscriberDevice[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(false)
  const maximum = Math.min(maxDeviceLimit, 5)

  const loadDevices = React.useCallback(async () => {
    try {
      const response = await fetch("/api/subscription/devices", {
        cache: "no-store",
      })
      const result = (await response.json()) as {
        devices?: SubscriberDevice[]
        message?: string
      }
      if (!response.ok || !Array.isArray(result.devices))
        throw new Error(result.message ?? "Не удалось загрузить устройства")
      setDevices(result.devices)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const retryLoadDevices = React.useCallback(() => {
    setLoading(true)
    setLoadError(false)
    void loadDevices()
  }, [loadDevices])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadDevices(), 0)
    return () => window.clearTimeout(timer)
  }, [loadDevices])

  const visibleDevices = devices.slice(0, deviceLimit)
  const freeSlots = Math.max(0, deviceLimit - visibleDevices.length)

  return (
    <Card className="gap-0 rounded-3xl border border-border/70 bg-card/40 py-0">
      <CardHeader className="gap-0 p-4 pb-0">
        <CardTitle>Устройства</CardTitle>
        <CardDescription>
          Можно подключить до {formatDeviceCountAfterPreposition(deviceLimit)}.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">Лимит: {deviceLimit}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 pt-4 pb-4">
        {loading ? (
          Array.from({ length: Math.min(deviceLimit, 3) }, (_, index) => (
            <Skeleton key={index} className="h-[62px] w-full" />
          ))
        ) : loadError ? (
          <Alert>
            <SmartphoneIcon />
            <AlertTitle>Не удалось загрузить устройства</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              Список временно недоступен. Попробуйте ещё раз.
              <Button
                type="button"
                variant="outline"
                onClick={retryLoadDevices}
              >
                Повторить
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {visibleDevices.map((device) => (
              <DeviceRow
                key={device.hwid}
                device={device}
                onDeleted={setDevices}
              />
            ))}
            {Array.from({ length: freeSlots }, (_, index) => (
              <PulsarActionRow
                key={`free-${index}`}
                icon={CircleDashedIcon}
                title={`Свободный слот ${visibleDevices.length + index + 1}`}
                description="Подключите новое устройство через Happ"
              />
            ))}
          </>
        )}

        {deviceLimit < maximum ? (
          <>
            <Separator className="my-1" />
            <DeviceLimitUpgradeDialog
              currentDeviceLimit={deviceLimit}
              maxDeviceLimit={maximum}
              deviceLimitUpgradePriceRub={deviceLimitUpgradePriceRub}
              pricingVersion={pricingVersion}
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DeviceRow({
  device,
  onDeleted,
}: {
  device: SubscriberDevice
  onDeleted: React.Dispatch<React.SetStateAction<SubscriberDevice[]>>
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const title = device.deviceModel || device.platform || "Устройство"
  const platform = device.platform

  async function deleteDevice() {
    setPending(true)
    try {
      const response = await fetch("/api/subscription/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hwid: device.hwid }),
      })
      const result = (await response.json()) as {
        devices?: SubscriberDevice[]
        message?: string
      }
      if (!response.ok || !Array.isArray(result.devices))
        throw new Error(result.message ?? "Не удалось удалить устройство")
      onDeleted(result.devices)
      setOpen(false)
      toast.success("Устройство удалено")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось удалить устройство"
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <PulsarActionRow
      icon={SmartphoneIcon}
      title={title}
      description={platform || "Подключено через Happ"}
      action={
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Удалить ${title}`}
              />
            }
          >
            <Trash2Icon />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить устройство?</AlertDialogTitle>
              <AlertDialogDescription>
                {title} потеряет доступ к VPN. Его можно будет подключить
                заново, если останется свободный слот.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={deleteDevice}
              >
                {pending ? "Удаляем…" : "Удалить"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      }
    />
  )
}

function DeviceLimitUpgradeDialog({
  currentDeviceLimit,
  maxDeviceLimit,
  deviceLimitUpgradePriceRub,
  pricingVersion,
}: {
  currentDeviceLimit: number
  maxDeviceLimit: number
  deviceLimitUpgradePriceRub: number
  pricingVersion: number
}) {
  const [open, setOpen] = React.useState(false)
  const [targetDeviceLimit, setTargetDeviceLimit] = React.useState(
    currentDeviceLimit + 1
  )
  const [pending, setPending] = React.useState(false)
  const idempotencyKey = React.useRef("")
  const addedDevices = targetDeviceLimit - currentDeviceLimit
  const amountMinor =
    addedDevices * Math.round(deviceLimitUpgradePriceRub * 100)

  React.useEffect(() => {
    idempotencyKey.current = ""
  }, [targetDeviceLimit])

  async function createPayment() {
    if (
      targetDeviceLimit <= currentDeviceLimit ||
      targetDeviceLimit > maxDeviceLimit
    )
      return
    setPending(true)
    try {
      idempotencyKey.current ||= crypto.randomUUID()
      const response = await fetch("/api/subscription/device-limit/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetDeviceLimit,
          expectedAmountMinor: amountMinor,
          pricingVersion,
          idempotencyKey: idempotencyKey.current,
        }),
      })
      const result = (await response.json()) as {
        checkoutUrl?: string
        message?: string
      }
      if (!response.ok || !result.checkoutUrl)
        throw new Error(result.message ?? "Не удалось создать платёж")
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось создать платёж"
      )
      idempotencyKey.current = ""
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <PulsarActionRow
        icon={SmartphoneIcon}
        title="Дополнительные"
        description={`За каждое устройство доплата ${formatPreviewRub(deviceLimitUpgradePriceRub)}`}
        action={
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Добавить устройства"
              />
            }
          >
            <PlusIcon />
          </DialogTrigger>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Увеличить лимит устройств</DialogTitle>
          <DialogDescription>Выберите лимит выше текущего.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <p className="text-sm font-medium">Новый лимит</p>
          <ToggleGroup
            value={[String(targetDeviceLimit)]}
            onValueChange={(values) => {
              const next = Number(values[0])
              if (next > currentDeviceLimit && next <= maxDeviceLimit)
                setTargetDeviceLimit(next)
            }}
            variant="outline"
            spacing={0}
            className="w-full"
          >
            {Array.from(
              { length: maxDeviceLimit - currentDeviceLimit },
              (_, index) => currentDeviceLimit + index + 1
            ).map((limit) => (
              <ToggleGroupItem
                key={limit}
                value={String(limit)}
                className="flex-1"
                aria-label={`${limit} устройств`}
              >
                {limit}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-sm text-muted-foreground">
            К доплате: {formatPreviewRub(amountMinor / 100)}
          </p>
        </div>

        <DialogFooter className="w-full">
          <Button
            type="button"
            size="lg"
            className={pulsarCtaClass}
            disabled={pending}
            onClick={createPayment}
          >
            {pending ? "Создаём платёж…" : formatPreviewRub(amountMinor / 100)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
