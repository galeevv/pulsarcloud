import Link from "next/link"

import {
  PulsarAssetCard,
  pulsarLinkButtonClass,
} from "@/components/app/pulsar-primitives"

export default async function AuthVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const isUsed = params.error === "used"

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
            {isUsed ? "Ссылка уже использована" : "Ссылка устарела"}
          </p>
          <p className="text-sm text-muted-foreground">
            Запросите новую ссылку для входа.
          </p>
        </div>
        <Link href="/" className={pulsarLinkButtonClass()}>
          Запросить новую ссылку
        </Link>
      </PulsarAssetCard>
    </main>
  )
}
