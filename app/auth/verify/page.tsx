import Image from "next/image"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export default async function AuthVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const isUsed = params.error === "used"

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0">
        <div className="relative aspect-[21/9] w-full">
          <Image
            src="/hero/pulsar.gif"
            alt="PulsarVPN"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 448px"
            unoptimized
            priority
          />
        </div>
        <Separator className="my-0" />
        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4 p-4 text-center">
          <div className="flex flex-col gap-1.5">
            <p className="text-[26px] leading-8 font-semibold tracking-normal">
              {isUsed ? "Ссылка уже использована" : "Ссылка устарела"}
            </p>
            <p className="text-sm text-muted-foreground">
              Запросите новую ссылку для входа.
            </p>
          </div>
          <Link
            href="/"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 w-full rounded-[18px]"
            )}
          >
            Запросить новую ссылку
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
