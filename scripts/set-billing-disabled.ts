import "dotenv/config"
import { db } from "@/src/server/infrastructure/db/client"

/**
 * Точечно включает или выключает оплату у одного аккаунта.
 *
 *   tsx scripts/set-billing-disabled.ts <email> on     # запретить оплату
 *   tsx scripts/set-billing-disabled.ts <email> off    # вернуть как у всех
 *   tsx scripts/set-billing-disabled.ts --list         # у кого сейчас отключено
 *
 * На проде запускать из каталога релиза:
 *   cd /opt/pulsar/current && set -a && . /etc/pulsar/pulsar.env && set +a \
 *     && npx tsx scripts/set-billing-disabled.ts demo@example.com on
 */
const [target, mode] = process.argv.slice(2)

function usage(message: string): never {
  console.error(`${message}

  tsx scripts/set-billing-disabled.ts <email> on|off
  tsx scripts/set-billing-disabled.ts --list`)
  process.exit(1)
}

try {
  if (target === "--list") {
    const disabled = await db.user.findMany({
      where: { billingDisabled: true },
      select: {
        id: true,
        identities: { select: { provider: true, emailNormalized: true } },
      },
    })
    if (disabled.length === 0)
      console.log("Аккаунтов с отключённой оплатой нет.")
    for (const user of disabled) {
      const email =
        user.identities.find((identity) => identity.provider === "EMAIL")
          ?.emailNormalized ?? "(без email)"
      console.log(`${user.id}  ${email}`)
    }
    process.exit(0)
  }

  if (!target || (mode !== "on" && mode !== "off"))
    usage("Укажи email аккаунта и режим on|off.")

  const identity = await db.authIdentity.findFirst({
    where: { provider: "EMAIL", emailNormalized: target.toLowerCase() },
    select: { userId: true },
  })
  if (!identity) usage(`Аккаунт с email ${target} не найден.`)

  const user = await db.user.update({
    where: { id: identity.userId },
    data: { billingDisabled: mode === "on" },
    select: { id: true, billingDisabled: true },
  })
  console.log(
    `${target} -> оплата ${user.billingDisabled ? "ОТКЛЮЧЕНА" : "включена"} (user ${user.id})`
  )
} finally {
  await db.$disconnect()
}
