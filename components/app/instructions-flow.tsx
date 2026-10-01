"use client"

import Image from "next/image"
import Link from "next/link"
import * as React from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BlocksIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LaptopIcon,
  Link2Icon,
  MonitorIcon,
  MonitorSmartphoneIcon,
  SmartphoneIcon,
} from "lucide-react"

import { buttonVariants, Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

type Platform = "Android" | "iOS" | "Windows" | "macOS"
type VpnApp = "incy" | "happ"
type Step =
  | "start"
  | "choose-device"
  | "choose-app"
  | "apple-region"
  | "install"
  | "key"
  | "done"

const platformOptions = [
  { value: "Android" as const, icon: SmartphoneIcon },
  { value: "iOS" as const, icon: SmartphoneIcon },
  { value: "Windows" as const, icon: MonitorIcon },
  { value: "macOS" as const, icon: LaptopIcon },
]

const appOptions = [
  {
    value: "incy" as const,
    name: "Incy",
    description: "Лучший выбор для Pulsar.",
    badge: "Рекомендуем",
    icon: "/instructions/apps/incy.webp",
  },
  {
    value: "happ" as const,
    name: "Happ",
    description: "Альтернативный вариант.",
    badge: "Поддерживается",
    icon: "/instructions/apps/happ.webp",
  },
]

const installLinks: Record<VpnApp, Record<Platform, string>> = {
  incy: {
    Android:
      "https://play.google.com/store/apps/details?id=llc.itdev.incy&hl=ru",
    iOS: "https://apps.apple.com/us/app/incy/id6756943388",
    Windows:
      "https://github.com/INCY-DEV/incy-platforms/releases/download/desktop-v3.3.9/incy-windows-setup.exe",
    macOS: "https://apps.apple.com/us/app/incy/id6756943388",
  },
  happ: {
    Android: "https://play.google.com/store/apps/details?id=com.happproxy",
    iOS: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
    Windows:
      "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe",
    macOS: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
  },
}

function subscribe(listener: () => void) {
  window.addEventListener("pulsar:device-change", listener)
  return () => window.removeEventListener("pulsar:device-change", listener)
}

function getPlatformSnapshot(): Platform | null {
  const value = `${navigator.userAgent} ${navigator.platform}`.toLowerCase()
  if (value.includes("android")) return "Android"
  if (/iphone|ipad|ipod/.test(value)) return "iOS"
  if (value.includes("mac")) return "macOS"
  if (value.includes("win")) return "Windows"
  return null
}

function getServerPlatformSnapshot() {
  return null
}

export function InstructionsFlow({
  hasActiveSubscription,
  subscriptionUrl,
}: {
  hasActiveSubscription: boolean
  subscriptionUrl: string | null
}) {
  const detectedPlatform = React.useSyncExternalStore(
    subscribe,
    getPlatformSnapshot,
    getServerPlatformSnapshot
  )
  const [step, setStep] = React.useState<Step>("start")
  const [, setHistory] = React.useState<Step[]>([])
  const [platform, setPlatform] = React.useState<Platform | null>(null)
  const [vpnApp, setVpnApp] = React.useState<VpnApp>("incy")
  const selectedAppName = vpnApp === "happ" ? "Happ" : "Incy"
  const connectionUrl = subscriptionUrl
    ? vpnApp === "incy"
      ? `incy://import/${subscriptionUrl}`
      : `happ://add/${subscriptionUrl}`
    : null

  function go(nextStep: Step) {
    setHistory((current) => [...current, step])
    setStep(nextStep)
  }

  function back() {
    setHistory((current) => {
      const previous = current.at(-1) ?? "start"
      setStep(previous)
      return current.slice(0, -1)
    })
  }

  function continueWithPlatform(nextPlatform: Platform) {
    setPlatform(nextPlatform)
    setVpnApp("incy")
    go("choose-app")
  }

  function continueWithApp() {
    if (!platform) return
    const needsAppStoreRegion =
      vpnApp === "happ" && (platform === "iOS" || platform === "macOS")
    go(needsAppStoreRegion ? "apple-region" : "install")
  }

  return (
    <div className="flex min-h-[420px] flex-col gap-5">
      <div className="flex flex-1 flex-col gap-5">
        {step === "start" ? (
          <StepIntro detectedPlatform={detectedPlatform} />
        ) : null}

        {step === "choose-device" ? (
          <section
            className="flex flex-1 flex-col gap-5"
            aria-labelledby="device-title"
          >
            <InstructionStepHeading
              compact
              titleId="device-title"
              icon={MonitorSmartphoneIcon}
              title="Выберите устройство"
              description="Выберите нужную платформу."
            />
            <div className="flex flex-1 items-center">
              <ToggleGroup
                value={platform ? [platform] : []}
                onValueChange={(values) =>
                  values[0] && setPlatform(values[0] as Platform)
                }
                orientation="vertical"
                variant="outline"
                spacing={0}
                className="w-full items-stretch"
                aria-label="Операционная система"
              >
                {platformOptions.map(({ value, icon: Icon }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="h-12 w-full justify-center"
                  >
                    <Icon data-icon="inline-start" />
                    {value}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </section>
        ) : null}

        {step === "choose-app" ? (
          <section
            className="flex flex-1 flex-col gap-5"
            aria-labelledby="app-title"
          >
            <InstructionStepHeading
              compact
              titleId="app-title"
              icon={BlocksIcon}
              title="Выберите приложение"
              description="Выберите приложение для подключения."
            />
            <div className="flex flex-1 items-center">
              <ToggleGroup
                value={[vpnApp]}
                onValueChange={(values) =>
                  values[0] && setVpnApp(values[0] as VpnApp)
                }
                orientation="vertical"
                variant="outline"
                spacing={0}
                className="w-full items-stretch"
                aria-label="Приложение для подключения"
              >
                {appOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className="h-auto min-h-24 w-full justify-center px-4 py-4 text-left"
                  >
                    <span className="flex w-full max-w-72 items-center gap-4">
                      <Image
                        src={option.icon}
                        alt=""
                        width={48}
                        height={48}
                        className="size-12 shrink-0 rounded-[14px]"
                      />
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5 whitespace-normal">
                        <span className="flex w-full flex-wrap items-center gap-2">
                          <span className="font-medium">{option.name}</span>
                          <Badge
                            variant={
                              option.value === "incy" ? "default" : "secondary"
                            }
                          >
                            {option.badge}
                          </Badge>
                        </span>
                        <span className="text-xs leading-5 text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </section>
        ) : null}

        {step === "apple-region" && platform ? (
          <AppleRegionStep platform={platform} />
        ) : null}

        {step === "install" && platform ? (
          <section
            className="flex flex-1 flex-col gap-5"
            aria-labelledby="install-title"
          >
            <InstructionStepHeading
              titleId="install-title"
              icon={DownloadIcon}
              title={`Установите ${selectedAppName}`}
              description="После установки вернитесь сюда, чтобы добавить подписку."
            />
          </section>
        ) : null}

        {step === "key" ? (
          <section
            className="flex flex-1 flex-col gap-5"
            aria-labelledby="key-title"
          >
            <InstructionStepHeading
              titleId="key-title"
              icon={Link2Icon}
              title="Добавьте подписку"
              description={`Нажмите «Подключить в ${selectedAppName}», чтобы автоматически добавить подписку.`}
            />
            {!subscriptionUrl ? (
              <Alert>
                <CircleAlertIcon />
                <AlertTitle>
                  {hasActiveSubscription
                    ? "Ключ ещё готовится"
                    : "Нужна активная подписка"}
                </AlertTitle>
                <AlertDescription>
                  {hasActiveSubscription
                    ? "Дождитесь завершения синхронизации. Повторная оплата не требуется."
                    : "Оформите подписку, чтобы получить персональный ключ подключения."}
                  <Link
                    href="/subscription"
                    className="mt-3 block underline underline-offset-4"
                  >
                    Перейти к подписке
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </section>
        ) : null}

        {step === "done" ? (
          <section
            className="flex flex-1 flex-col gap-5"
            aria-labelledby="done-title"
          >
            <InstructionStepHeading
              titleId="done-title"
              icon={CheckCircle2Icon}
              title="Готово!"
              description="Поздравляем, VPN подключен — пользуйтесь интернетом без ограничений."
            />
          </section>
        ) : null}
      </div>

      <div className="mt-auto grid shrink-0 grid-cols-2 gap-3">
        {step === "start" ? (
          <>
            {detectedPlatform ? (
              <Button
                type="button"
                size="lg"
                className="col-span-2 h-11 rounded-[18px]"
                onClick={() => continueWithPlatform(detectedPlatform)}
              >
                На этом устройстве
              </Button>
            ) : null}
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="col-span-2 h-11 rounded-[18px]"
              onClick={() => go("choose-device")}
            >
              На другом устройстве
            </Button>
          </>
        ) : null}
        {step === "install" && platform ? (
          <a
            href={installLinks[vpnApp][platform]}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "col-span-2 h-11 w-full rounded-[18px]"
            )}
          >
            <DownloadIcon data-icon="inline-start" />
            Установить {selectedAppName}
            <ExternalLinkIcon data-icon="inline-end" />
          </a>
        ) : null}
        {step === "key" && connectionUrl ? (
          <a
            href={connectionUrl}
            className={cn(
              buttonVariants({ size: "lg" }),
              "col-span-2 h-11 w-full rounded-[18px]"
            )}
          >
            <Link2Icon data-icon="inline-start" />
            Подключить в {selectedAppName}
          </a>
        ) : null}
        {step !== "start" && step !== "done" ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-11 rounded-[18px]"
            onClick={back}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Назад
          </Button>
        ) : null}
        {step === "choose-device" ? (
          <Button
            type="button"
            size="lg"
            className="h-11 rounded-[18px]"
            disabled={!platform}
            onClick={() => platform && continueWithPlatform(platform)}
          >
            Продолжить
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : null}
        {step === "choose-app" ? (
          <Button
            type="button"
            size="lg"
            className="h-11 rounded-[18px]"
            onClick={continueWithApp}
          >
            Продолжить
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : null}
        {step === "apple-region" || step === "install" ? (
          <Button
            type="button"
            size="lg"
            className="h-11 rounded-[18px]"
            onClick={() => go(step === "apple-region" ? "install" : "key")}
          >
            Продолжить
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : null}
        {step === "key" ? (
          <Button
            type="button"
            size="lg"
            className="h-11 rounded-[18px]"
            disabled={!subscriptionUrl}
            onClick={() => go("done")}
          >
            Завершить
          </Button>
        ) : null}
        {step === "done" ? (
          <Link
            href="/home"
            className={cn(
              buttonVariants({ size: "lg" }),
              "col-span-2 h-11 rounded-[18px]"
            )}
          >
            На главную
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function StepIntro({
  detectedPlatform,
}: {
  detectedPlatform: Platform | null
}) {
  const DetectedPlatformIcon =
    platformOptions.find((option) => option.value === detectedPlatform)?.icon ??
    SmartphoneIcon

  return (
    <section
      className="flex flex-1 flex-col gap-5"
      aria-labelledby="intro-title"
    >
      <InstructionStepHeading
        titleId="intro-title"
        icon={DetectedPlatformIcon}
        title={
          detectedPlatform ? `Настроить на ${detectedPlatform}?` : "Выберите ОС"
        }
        description={
          detectedPlatform
            ? "Продолжите на этом устройстве или выберите другое."
            : "Выберите устройство, на котором хотите настроить VPN."
        }
      />
    </section>
  )
}

function InstructionStepHeading({
  compact = false,
  description,
  icon: Icon,
  title,
  titleId,
}: {
  compact?: boolean
  description: string
  icon: LucideIcon
  title: string
  titleId: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 text-center",
        !compact && "flex-1"
      )}
    >
      <div className="flex size-18 items-center justify-center rounded-[22px] border border-border/70 bg-background/40">
        <Icon className="size-7" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 id={titleId} className="text-2xl font-semibold">
          {title}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function AppleRegionStep({ platform }: { platform: Platform }) {
  const isMacOS = platform === "macOS"
  const items: Array<{ text: string; image?: string; alt?: string }> = isMacOS
    ? [
        { text: "Откройте приложение Apple Music или Apple TV." },
        {
          text: "На компьютере Mac в строке меню выберите «Учетная запись», а затем — «Настройки учетной записи». На компьютере с Windows нажмите на свое имя в нижней части бокового меню, затем нажмите «Просмотреть мою учетную запись».",
        },
        { text: "Возможно, вам придется войти в Аккаунт Apple." },
        {
          image: "/instructions/app-store/apple-account-information.png",
          alt: "Информация об учетной записи в Apple Music на компьютере Mac",
          text: "На странице «Информация об учетной записи» нажмите «Изменить страну или регион».",
        },
        { text: "Выберите новую страну или регион." },
        {
          text: "Просмотрите положения и условия, затем нажмите «Принимаю». Нажмите «Принимаю» еще раз для подтверждения.",
        },
        {
          text: "Введите новую платежную информацию* и адрес выставления счетов, затем нажмите «Продолжить».",
        },
      ]
    : [
        { text: "Откройте приложение «Настройки»." },
        { text: "Нажмите на свое имя → «Контент и покупки» → «Просмотреть»." },
        { text: "Авторизуйтесь с помощью Face ID или Touch ID." },
        {
          image: "/instructions/app-store/apple-region-tinkoff.png",
          alt: "Раздел «Страна/регион» в настройках Аккаунта Apple",
          text: "Нажмите «Страна/регион». При активных подписках их потребуется отменить.",
        },
        { text: "Выберите страну. Например, США." },
        {
          text: "Прочитайте условия и нажмите «Принять».",
        },
        {
          text: "Выберите способ оплаты. Если покупки не нужны, выберите «Нет».",
        },
        {
          text: "Введите адрес для выставления счета и нажмите «Далее».",
        },
      ]

  return (
    <section
      className="flex flex-col items-center gap-5 text-center"
      aria-labelledby="region-title"
    >
      <div className="flex flex-col items-center gap-1">
        <h1 id="region-title" className="text-xl font-semibold">
          Поменяйте регион App Store
        </h1>
        <p className="text-center text-sm text-muted-foreground">
          {isMacOS
            ? "Смените регион Аккаунта Apple через Apple Music или Apple TV."
            : "Для Happ может понадобиться смена региона."}
        </p>
      </div>
      <Card
        size="sm"
        className="w-full rounded-[22px] border border-border/70 bg-transparent py-0 text-left shadow-none! ring-0!"
      >
        <CardContent className="p-4">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm marker:font-semibold">
            {items.map((item) => (
              <li key={item.text} className="pl-1 leading-relaxed">
                <span>{item.text}</span>
                {item.image && item.alt ? (
                  <Image
                    src={item.image}
                    alt={item.alt}
                    width={isMacOS ? 1400 : 760}
                    height={isMacOS ? 982 : 838}
                    sizes="(max-width: 768px) 100vw, 448px"
                    className="mt-3 h-auto w-full rounded-2xl"
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <AppleSupportSource />
    </section>
  )
}

function AppleSupportSource() {
  return (
    <p className="text-xs text-muted-foreground">
      Источник:{" "}
      <a
        href="https://t-j.ru/apple-region/"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        Т—Ж
      </a>
      .
    </p>
  )
}
