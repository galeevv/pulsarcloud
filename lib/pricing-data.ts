import type { Prisma, PrismaClient } from "@/generated/prisma/client"

type PricingReader = Pick<PrismaClient, "pricingVersion"> | Prisma.TransactionClient

export function getActivePricingVersion(client: PricingReader) {
  return client.pricingVersion.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { version: "desc" },
  })
}
