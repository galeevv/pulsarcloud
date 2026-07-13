import Link from "next/link"
import type { Metadata } from "next"

import {
  PulsarAssetCard,
  pulsarLinkButtonClass,
} from "@/components/app/pulsar-primitives"

export const metadata: Metadata = {
  title: "Ссылка для входа",
}

export default async function AuthVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const isUsed = params.error === "used"
  const isWrongDevice = params.error === "device"

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <PulsarAssetCard
        src="/hero/pulsar.gif"
        alt="PulsarVPN"
        cardClassName="w-full max-w-md"
        contentClassName="flex min-h-56 flex-col items-center justify-center gap-4 text-center"
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-[26px] leading-8 font-semibold tracking-normal">
            {isWrongDevice
              ? "Откройте ссылку в исходном браузере"
              : isUsed
                ? "Ссылка уже использована"
                : "Ссылка устарела"}
          </p>
          <p className="text-sm text-muted-foreground">
            {isWrongDevice
              ? "Ссылка должна быть открыта в том же браузере и на том же устройстве, где вы начали вход. Вернитесь туда и откройте ссылку ещё раз."
              : "Запросите новую ссылку для входа."}
          </p>
        </div>
        <Link href="/" className={pulsarLinkButtonClass()}>
          Запросить новую ссылку
        </Link>
      </PulsarAssetCard>
    </main>
  )
}
