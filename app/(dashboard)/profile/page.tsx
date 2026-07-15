import Link from "next/link"
import type { Metadata } from "next"
import {
  ChevronRightIcon,
  FileTextIcon,
  HeadphonesIcon,
  LogOutIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { LogoutAction } from "@/components/app/logout-action"
import {
  PulsarActionRow,
  PulsarAssetCard,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import { LoginMethodsManager } from "@/components/app/login-methods-manager"
import { getProfileView } from "@/src/server/queries/user-dashboard"
import { requireWebSession } from "@/src/server/transport/web/session"

export const metadata: Metadata = {
  title: { absolute: "PULSAR" },
}

export default async function ProfilePage() {
  const session = await requireWebSession("USER")
  const user = await getProfileView(session.userId)
  const email =
    user.identities.find((identity) => identity.provider === "EMAIL")
      ?.emailNormalized ?? null
  const telegramId =
    user.identities.find((identity) => identity.provider === "TELEGRAM")
      ?.telegramId ?? null
  const telegramUsername =
    user.identities.find((identity) => identity.provider === "TELEGRAM")
      ?.telegramUsername ?? null

  return (
    <main className="pulsar-container">
      <PulsarAssetCard
        src="/details/birth.gif"
        alt="Профиль Pulsar"
        contentClassName="flex min-h-56 flex-col justify-center gap-4"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[26px] leading-8 font-semibold tracking-normal">
            Профиль
          </h1>
        </div>

        <LoginMethodsManager
          email={email}
          telegramId={telegramId}
          telegramUsername={telegramUsername}
        />

        <Link href="/support" className="group block">
          <PulsarActionRow
            icon={HeadphonesIcon}
            title="Написать в поддержку"
            description="Поможем с доступом и оплатой"
            className="transition-colors group-hover:bg-card/55"
            trailing={
              <ChevronRightIcon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            }
          />
        </Link>

        <LegalCard />

        <LogoutConfirmDialog />
      </PulsarAssetCard>
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
            className={`${pulsarCtaClass} text-destructive hover:bg-destructive/10 hover:text-destructive`}
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
          <LogoutAction />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function LegalCard() {
  return (
    <Link href="/legal" className="group block">
      <PulsarActionRow
        icon={FileTextIcon}
        title="Юридическая информация"
        description="Оферта, политика и соглашение"
        className="transition-colors group-hover:bg-card/55"
        trailing={
          <ChevronRightIcon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
        }
      />
    </Link>
  )
}
