"use client"

import * as React from "react"
import {
  AppleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  CopyIcon,
  CreditCardIcon,
  DownloadIcon,
  LaptopIcon,
  Link2Icon,
  MonitorIcon,
  Settings2Icon,
  SmartphoneIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  pulsarControlClass,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type SetupStep =
  "start" | "choose-device" | "install-app" | "subscription" | "done"
type DevicePlatform = "Android" | "iOS" | "Windows" | "macOS"
type InstallReturnStep = "start" | "choose-device"

const APP_LINKS: Record<
  DevicePlatform,
  Array<{
    label: string
    url: string
  }>
> = {
  Android: [
    {
      label: "Google Play",
      url: "https://play.google.com/store/apps/details?id=com.happproxy",
    },
  ],
  iOS: [
    {
      label: "App Store RU",
      url: "https://apps.apple.com/ru/app/happ-proxy-utility/id6783623643",
    },
    {
      label: "App Store Global",
      url: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    },
  ],
  macOS: [
    {
      label: "App Store Global",
      url: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    },
  ],
  Windows: [
    {
      label: "Windows installer",
      url: "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe",
    },
  ],
}

const DEVICE_OPTIONS: Array<{
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  platform: DevicePlatform
}> = [
  { icon: SmartphoneIcon, platform: "Android" },
  { icon: AppleIcon, platform: "iOS" },
  { icon: MonitorIcon, platform: "Windows" },
  { icon: LaptopIcon, platform: "macOS" },
]

function detectCurrentPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") {
    return "Windows"
  }

  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  if (/android/.test(userAgent)) {
    return "Android"
  }

  if (/iphone|ipad|ipod/.test(userAgent) || /ipad|iphone|ipod/.test(platform)) {
    return "iOS"
  }

  if (/mac/.test(platform)) {
    return "macOS"
  }

  return "Windows"
}

function subscribePlatformStore() {
  return () => {}
}

function getServerPlatform(): DevicePlatform {
  return "Windows"
}

function formatCompactSubscriptionUrl(url: string | null) {
  if (!url) {
    return "Ссылка появится после оплаты"
  }

  try {
    const parsedUrl = new URL(url)
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean)
    const token = pathSegments[pathSegments.length - 1] ?? ""

    if (!token) {
      return parsedUrl.host
    }

    return `${parsedUrl.host}/...${token.slice(-6)}`
  } catch {
    const token = url.split("/").filter(Boolean).at(-1) ?? ""

    return token ? `...${token.slice(-10)}` : url
  }
}

function StepIcon({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto flex size-16 items-center justify-center rounded-[22px] border border-border/70 bg-background/40",
        className
      )}
    >
      {children}
    </div>
  )
}

function SetupStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center gap-5 text-center">
      {children}
    </div>
  )
}

function SetupActions({ children }: { children: React.ReactNode }) {
  return <div className="grid w-full gap-3">{children}</div>
}

function SetupVpnFlow({
  onComplete,
  onOpenPayment,
  subscriptionUrl,
}: {
  onComplete: () => void
  onOpenPayment: () => void
  subscriptionUrl?: string | null
}) {
  const currentPlatform = React.useSyncExternalStore(
    subscribePlatformStore,
    detectCurrentPlatform,
    getServerPlatform
  )
  const [step, setStep] = React.useState<SetupStep>("start")
  const [selectedPlatform, setSelectedPlatform] =
    React.useState<DevicePlatform>("Windows")
  const [installReturnStep, setInstallReturnStep] =
    React.useState<InstallReturnStep>("start")
  const effectiveSubscriptionUrl = subscriptionUrl ?? null
  const displaySubscriptionUrl = formatCompactSubscriptionUrl(
    effectiveSubscriptionUrl
  )

  function handleBack() {
    if (step === "choose-device") {
      setStep("start")
      return
    }

    if (step === "install-app") {
      setStep(installReturnStep)
      return
    }

    if (step === "subscription") {
      setStep("install-app")
      return
    }

    if (step === "done") {
      setStep("subscription")
    }
  }

  async function copySubscriptionUrl() {
    if (!effectiveSubscriptionUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(effectiveSubscriptionUrl)
      toast.success("Ссылка подписки скопирована")
    } catch {
      toast.error("Не удалось скопировать ссылку")
    }
  }

  const showBackButton = step !== "start"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-4 text-center">
          {showBackButton ? (
            <div className="flex justify-start">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Вернуться на предыдущий шаг"
                onClick={handleBack}
              >
                <ArrowLeftIcon />
              </Button>
            </div>
          ) : null}

          {step === "start" ? (
            <SetupStage>
              <StepIcon>
                <Settings2Icon className="size-10" />
              </StepIcon>
              <DialogHeader className="items-center gap-2 text-center">
                <DialogTitle>Настройка на {currentPlatform}</DialogTitle>
                <DialogDescription className="max-w-72">
                  Установите Happ и добавьте подписку Pulsar в пару действий.
                </DialogDescription>
              </DialogHeader>
              <SetupActions>
                <Button
                  type="button"
                  size="lg"
                  className={pulsarControlClass}
                  onClick={() => {
                    setSelectedPlatform(detectCurrentPlatform())
                    setInstallReturnStep("start")
                    setStep("install-app")
                  }}
                >
                  <Settings2Icon data-icon="inline-start" />
                  На этом устройстве
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className={pulsarControlClass}
                  onClick={() => setStep("choose-device")}
                >
                  Выбрать другое устройство
                </Button>
              </SetupActions>
            </SetupStage>
          ) : null}

          {step === "choose-device" ? (
            <SetupStage>
              <StepIcon>
                <SmartphoneIcon className="size-10" />
              </StepIcon>
              <DialogHeader className="items-center gap-2 text-center">
                <DialogTitle>Выберите устройство</DialogTitle>
                <DialogDescription>
                  Укажите платформу, на которой хотите настроить Pulsar.
                </DialogDescription>
              </DialogHeader>
              <SetupActions>
                {DEVICE_OPTIONS.map((item) => {
                  const Icon = item.icon

                  return (
                    <Button
                      key={item.platform}
                      type="button"
                      size="lg"
                      variant="outline"
                      className={pulsarControlClass}
                      onClick={() => {
                        setSelectedPlatform(item.platform)
                        setInstallReturnStep("choose-device")
                        setStep("install-app")
                      }}
                    >
                      <Icon data-icon="inline-start" />
                      {item.platform}
                    </Button>
                  )
                })}
              </SetupActions>
            </SetupStage>
          ) : null}

          {step === "install-app" ? (
            <SetupStage>
              <StepIcon>
                <DownloadIcon className="size-10" />
              </StepIcon>
              <DialogHeader className="items-center gap-2 text-center">
                <DialogTitle>Установите Happ</DialogTitle>
                <DialogDescription>
                  После установки вернитесь сюда, чтобы добавить подписку.
                </DialogDescription>
              </DialogHeader>
              <SetupActions>
                {APP_LINKS[selectedPlatform].map((link) => (
                  <a
                    key={link.url}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      pulsarControlClass
                    )}
                    href={link.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <DownloadIcon data-icon="inline-start" />
                    {link.label}
                  </a>
                ))}
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className={pulsarControlClass}
                  onClick={() => setStep("subscription")}
                >
                  Далее
                </Button>
              </SetupActions>
            </SetupStage>
          ) : null}

          {step === "subscription" ? (
            <SetupStage>
              <StepIcon>
                <Link2Icon className="size-10" />
              </StepIcon>

              {effectiveSubscriptionUrl ? (
                <>
                  <DialogHeader className="items-center gap-2 text-center">
                    <DialogTitle>Добавьте подписку</DialogTitle>
                    <DialogDescription>
                      Откройте ссылку в Happ или скопируйте её вручную.
                    </DialogDescription>
                  </DialogHeader>
                  <SetupActions>
                    <button
                      type="button"
                      className={cn(
                        "flex min-w-0 items-center justify-between gap-3 border border-border/70 bg-background/40 px-3 text-left font-mono text-sm",
                        pulsarControlClass
                      )}
                      onClick={copySubscriptionUrl}
                    >
                      <span className="truncate">{displaySubscriptionUrl}</span>
                      <CopyIcon className="size-4 shrink-0" />
                    </button>
                    <Button
                      type="button"
                      className={cn(
                        buttonVariants({ size: "lg" }),
                        pulsarControlClass
                      )}
                      onClick={() => window.location.assign(effectiveSubscriptionUrl)}
                    >
                      <Link2Icon data-icon="inline-start" />
                      Подключить в Happ
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      className={pulsarControlClass}
                      onClick={() => setStep("done")}
                    >
                      Продолжить
                    </Button>
                  </SetupActions>
                </>
              ) : (
                <>
                  <DialogHeader className="items-center gap-2 text-center">
                    <DialogTitle>Ссылка подписки пока недоступна</DialogTitle>
                    <DialogDescription className="max-w-72">
                      Оплатите подписку или дождитесь завершения обновления
                      доступа.
                    </DialogDescription>
                  </DialogHeader>
                  <SetupActions>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      className={pulsarControlClass}
                      onClick={onOpenPayment}
                    >
                      <CreditCardIcon data-icon="inline-start" />
                      Перейти к подписке
                    </Button>
                  </SetupActions>
                </>
              )}
            </SetupStage>
          ) : null}

          {step === "done" ? (
            <SetupStage>
              <StepIcon>
                <CheckCircle2Icon className="size-10" />
              </StepIcon>
              <DialogHeader className="items-center gap-2 text-center">
                <DialogTitle>Готово</DialogTitle>
                <DialogDescription>
                  Подписка Pulsar добавлена в Happ. Теперь откройте приложение и
                  включите VPN.
                </DialogDescription>
              </DialogHeader>
              <SetupActions>
                <Button
                  type="button"
                  size="lg"
                  className={pulsarControlClass}
                  onClick={onComplete}
                >
                  Завершить
                </Button>
              </SetupActions>
            </SetupStage>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function SetupVpnAction({
  subscriptionUrl,
}: {
  subscriptionUrl?: string | null
}) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  const handleOpenPayment = React.useCallback(() => {
    setIsDialogOpen(false)
    window.setTimeout(() => {
      window.dispatchEvent(new Event("pulsar:open-subscription-payment"))
    }, 80)
  }, [])

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="lg"
            variant="outline"
            className={pulsarCtaClass}
          />
        }
      >
        <Settings2Icon data-icon="inline-start" />
        Настроить VPN
      </DialogTrigger>
      <DialogContent className="flex max-h-[88svh] flex-col overflow-hidden rounded-3xl border border-border/70 p-6 shadow-none ring-0 sm:max-w-md dark:ring-0">
        {isDialogOpen ? (
          <SetupVpnFlow
            subscriptionUrl={subscriptionUrl}
            onComplete={() => setIsDialogOpen(false)}
            onOpenPayment={handleOpenPayment}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
