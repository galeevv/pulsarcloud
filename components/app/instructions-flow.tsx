"use client"

import Image from "next/image"
import Link from "next/link"
import * as React from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LaptopIcon,
  Link2Icon,
  MonitorIcon,
  SmartphoneIcon,
} from "lucide-react"

import { buttonVariants, Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

type Platform = "Android" | "iOS" | "Windows" | "macOS"
type Step =
  "start" | "choose-device" | "apple-region" | "install" | "key" | "done"

const platformOptions = [
  { value: "Android" as const, icon: SmartphoneIcon },
  { value: "iOS" as const, icon: SmartphoneIcon },
  { value: "Windows" as const, icon: MonitorIcon },
  { value: "macOS" as const, icon: LaptopIcon },
]

const installLinks: Record<Platform, string> = {
  Android: "https://play.google.com/store/apps/details?id=com.happproxy",
  iOS: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
  Windows:
    "https://github.com/Happ-proxy/happ-desktop/releases/latest/download/setup-Happ.x64.exe",
  macOS: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215",
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
    go(
      nextPlatform === "iOS" || nextPlatform === "macOS"
        ? "apple-region"
        : "install"
    )
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
            <div className="flex flex-col gap-1">
              <h1 id="device-title" className="text-xl font-semibold">
                Выберите устройство
              </h1>
              <p className="text-sm text-muted-foreground">
                Для каждой платформы покажем подходящую инструкцию.
              </p>
            </div>
            <div className="flex flex-1 items-center">
              <ToggleGroup
                value={platform ? [platform] : []}
                onValueChange={(values) =>
                  values[0] && continueWithPlatform(values[0] as Platform)
                }
                orientation="vertical"
                variant="outline"
                spacing={3}
                className="w-full items-stretch"
                aria-label="Операционная система"
              >
                {platformOptions.map(({ value, icon: Icon }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="h-12 w-full justify-start rounded-[18px] px-4"
                  >
                    <Icon data-icon="inline-start" />
                    {value}
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
              title="Установите Happ"
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
              description="Нажмите «Подключить в Happ», чтобы автоматически добавить подписку."
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
            href={installLinks[platform]}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "col-span-2 h-11 w-full rounded-[18px]"
            )}
          >
            <DownloadIcon data-icon="inline-start" />
            Установить HAPP
            <ExternalLinkIcon data-icon="inline-end" />
          </a>
        ) : null}
        {step === "key" && subscriptionUrl ? (
          <a
            href={`happ://add/${subscriptionUrl}`}
            className={cn(
              buttonVariants({ size: "lg" }),
              "col-span-2 h-11 w-full rounded-[18px]"
            )}
          >
            <Link2Icon data-icon="inline-start" />
            Подключить в Happ
          </a>
        ) : null}
        {step !== "start" && step !== "done" ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className={cn(
              "h-11 rounded-[18px]",
              step === "choose-device" && "col-span-2"
            )}
            onClick={back}
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Назад
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
  description,
  icon: Icon,
  title,
  titleId,
}: {
  description: string
  icon: LucideIcon
  title: string
  titleId: string
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
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
        { text: "Нажмите на свое имя, а затем — «Контент и покупки»." },
        { text: "Нажмите «Просмотреть». Может потребоваться выполнить вход." },
        {
          image: "/instructions/app-store/apple-country-region.png",
          alt: "Раздел «Страна/регион» в настройках Аккаунта Apple",
          text: "Нажмите «Страна/регион».",
        },
        { text: "Выберите новую страну или регион." },
        { text: "Нажмите «Изменить страну или регион»." },
        {
          text: "Выберите новую страну или регион, затем просмотрите положения и условия.",
        },
        {
          text: "Нажмите «Принимаю» в верхнем правом углу, затем снова нажмите «Принимаю» для подтверждения.",
        },
      ]

  return (
    <section className="flex flex-col gap-5" aria-labelledby="region-title">
      <div className="flex flex-col gap-1">
        <h1 id="region-title" className="text-xl font-semibold">
          Поменяйте регион App Store
        </h1>
        <p className="text-sm text-muted-foreground">
          {isMacOS
            ? "Смените регион Аккаунта Apple через Apple Music или Apple TV."
            : "В российском App Store приложение Happ может быть недоступно."}
        </p>
      </div>
      <Card
        size="sm"
        className="rounded-[22px] border border-border/70 bg-transparent py-0 shadow-none! ring-0!"
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
        href="https://support.apple.com/ru-ru/118283"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        Служба поддержки Apple
      </a>
      .
    </p>
  )
}
