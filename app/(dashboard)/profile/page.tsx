import Image from "next/image"
import Link from "next/link"
import {
  CheckIcon,
  ChevronRightIcon,
  FileTextIcon,
  HeadphonesIcon,
  LogOutIcon,
  MailIcon,
  SendIcon,
} from "lucide-react"

import { logoutAction } from "@/app/(dashboard)/actions"
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
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { requireUser } from "@/lib/auth"

export default async function ProfilePage() {
  const user = await requireUser()

  return (
    <main className="pulsar-container">
      <Card className="gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0">
        <div className="relative aspect-[21/9] w-full">
          <Image
            src="/details/birth.gif"
            alt="Профиль Pulsar"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 448px"
            unoptimized
            priority
          />
        </div>
        <Separator className="my-0" />
        <CardContent className="flex min-h-56 flex-col justify-center gap-4 p-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[26px] leading-8 font-semibold tracking-normal">
              Профиль
            </p>
          </div>

          <LoginMethodsCard email={user.email} telegramId={user.telegramId} />

          <Link href="/support" className="group block">
            <div className="soft-panel flex min-h-[62px] items-center justify-between gap-3 p-3 transition-colors group-hover:bg-card/55">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
                  <HeadphonesIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    Написать в поддержку
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Поможем с доступом и оплатой
                  </p>
                </div>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
          </Link>

          <LegalCard />

          <LogoutConfirmDialog />
        </CardContent>
      </Card>
    </main>
  )
}

function LogoutConfirmDialog() {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full rounded-[18px] text-destructive hover:bg-destructive/10 hover:text-destructive"
          />
        }
      >
        <LogOutIcon data-icon="inline-start" />
        Выйти из аккаунта
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Выйти из аккаунта?</AlertDialogTitle>
          <AlertDialogDescription>
            Для возвращения в личный кабинет нужно будет снова войти через email
            или Telegram.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <form action={logoutAction}>
            <AlertDialogAction
              type="submit"
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Выйти
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function LoginMethodsCard({
  email,
  telegramId,
}: {
  email: string | null
  telegramId: string | null
}) {
  return (
    <div className="soft-panel flex flex-col gap-3 p-3">
      <p className="text-center text-sm font-semibold">Способы входа</p>
      <LoginMethodRow
        icon={MailIcon}
        label="Email"
        value={email ?? "Не привязан"}
        connected={Boolean(email)}
        actionLabel="Привязать"
        actionDisabled={Boolean(email)}
      />
      <LoginMethodRow
        icon={SendIcon}
        label="Telegram"
        value={telegramId ? `id: ${telegramId}` : "Не привязан"}
        connected={Boolean(telegramId)}
        actionLabel="Привязать"
        actionDisabled
      />
    </div>
  )
}

function LoginMethodRow({
  actionDisabled,
  actionLabel,
  connected,
  icon: Icon,
  label,
  value,
}: {
  actionDisabled: boolean
  actionLabel: string
  connected: boolean
  icon: typeof MailIcon
  label: string
  value: string
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/25 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium">{value}</p>
        </div>
      </div>
      {connected ? (
        <Badge variant="secondary">
          <CheckIcon data-icon="inline-start" />
          Привязан
        </Badge>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-[14px]"
          disabled={actionDisabled}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

function LegalCard() {
  return (
    <Link href="/legal" className="group block">
      <div className="soft-panel flex min-h-[62px] items-center justify-between gap-3 p-3 transition-colors group-hover:bg-card/55">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/40">
            <FileTextIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              Юридическая информация
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Оферта, политика и соглашение
            </p>
          </div>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>
    </Link>
  )
}
