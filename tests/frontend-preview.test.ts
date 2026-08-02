import assert from "node:assert/strict"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = process.cwd()

const routeFiles = [
  "app/page.tsx",
  "app/auth/verify/page.tsx",
  "app/(dashboard)/home/page.tsx",
  "app/(dashboard)/subscription/page.tsx",
  "app/(dashboard)/referrals/page.tsx",
  "app/(dashboard)/profile/page.tsx",
  "app/(dashboard)/support/page.tsx",
  "app/(dashboard)/legal/page.tsx",
  "app/(dashboard)/instructions/page.tsx",
]

async function collectFiles(directory: string): Promise<string[]> {
  const absolute = path.join(root, directory)
  const entries = await readdir(absolute)
  const files: string[] = []

  for (const entry of entries) {
    const child = path.join(absolute, entry)
    const details = await stat(child)
    if (details.isDirectory()) {
      files.push(...(await collectFiles(path.relative(root, child))))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(child)
    }
  }

  return files
}

test("all user frontend route modules remain present", async () => {
  for (const route of routeFiles) {
    const source = await readFile(path.join(root, route), "utf8")
    assert.match(source, /export default/)
  }
})

test("navigation and primary preview interfaces remain wired", async () => {
  const navigation = await readFile(
    path.join(root, "components/app/bottom-nav.tsx"),
    "utf8"
  )
  for (const href of ["/home", "/subscription", "/referrals", "/profile"]) {
    assert.ok(navigation.includes(href), `missing navigation target ${href}`)
  }

  const checkout = await readFile(
    path.join(root, "components/app/subscription-payment-action.tsx"),
    "utf8"
  )
  assert.match(checkout, /<Drawer/)
  assert.match(checkout, /<Dialog/)
  assert.match(checkout, /paymentMethod: "SBP"/)
  assert.match(checkout, /type="submit"/)
  assert.doesNotMatch(checkout, /<span>Оплатить<\/span>/)
  assert.doesNotMatch(checkout, /CheckoutStep|setStep\("confirm"\)/)

  const profile = await readFile(
    path.join(root, "app/(dashboard)/profile/page.tsx"),
    "utf8"
  )
  assert.match(profile, /LoginMethodsManager/)

  const support = await readFile(
    path.join(root, "app/(dashboard)/support/page.tsx"),
    "utf8"
  )
  assert.match(support, /SupportThread/)
  assert.match(support, /SupportComposer/)
})

test("Incy and Happ instruction flows use the correct links", async () => {
  const subscription = await readFile(
    path.join(root, "app/(dashboard)/subscription/page.tsx"),
    "utf8"
  )
  const instructions = await readFile(
    path.join(root, "components/app/instructions-flow.tsx"),
    "utf8"
  )
  const home = await readFile(
    path.join(root, "app/(dashboard)/home/page.tsx"),
    "utf8"
  )

  assert.match(subscription, /<Link href="\/instructions"/)
  assert.match(subscription, /Инструкция/)
  assert.doesNotMatch(subscription, /incy:\/\/import|happ:\/\/add/)
  assert.match(instructions, /incy:\/\/import\/\$\{subscriptionUrl\}/)
  assert.match(instructions, /happ:\/\/add\/\$\{subscriptionUrl\}/)
  assert.match(instructions, /React\.useState<VpnApp>\("incy"\)/)
  assert.match(instructions, /"choose-app"/)
  assert.match(instructions, /Выберите приложение/)
  assert.match(instructions, /Рекомендуем/)
  assert.match(instructions, /Поддерживается/)
  assert.match(instructions, /vpnApp === "happ"/)
  assert.match(instructions, /platform === "iOS" \|\| platform === "macOS"/)
  assert.match(
    instructions,
    /play\.google\.com\/store\/apps\/details\?id=llc\.itdev\.incy/
  )
  assert.match(instructions, /apps\.apple\.com\/us\/app\/incy\/id6756943388/)
  assert.match(instructions, /incy-windows-setup\.exe/)
  assert.match(instructions, /\/instructions\/apps\/incy\.webp/)
  assert.match(instructions, /\/instructions\/apps\/happ\.webp/)
  assert.equal(
    (
      await stat(path.join(root, "public/instructions/apps/incy.webp"))
    ).isFile(),
    true
  )
  assert.equal(
    (
      await stat(path.join(root, "public/instructions/apps/happ.webp"))
    ).isFile(),
    true
  )
  assert.match(instructions, /На этом устройстве/)
  assert.match(instructions, /Настроить на \$\{detectedPlatform\}\?/)
  assert.match(
    instructions,
    /Продолжите на этом устройстве или выберите другое/
  )
  assert.match(instructions, /size-18/)
  assert.match(instructions, /size-7/)
  assert.match(instructions, /Установите \$\{selectedAppName\}/)
  assert.match(instructions, /Установить \{selectedAppName\}/)
  assert.match(instructions, /Добавьте подписку/)
  assert.match(instructions, /InstructionStepHeading/)
  assert.match(instructions, /border border-border\/70 bg-transparent/)
  assert.match(instructions, /icon=\{DownloadIcon\}/)
  assert.match(instructions, /icon=\{Link2Icon\}/)
  assert.match(instructions, /icon=\{CheckCircle2Icon\}/)
  assert.match(
    instructions,
    /После установки вернитесь сюда, чтобы добавить подписку/
  )
  assert.doesNotMatch(instructions, /SubscriptionUrlCard/)
  assert.match(instructions, /Поменяйте регион App Store/)
  assert.match(instructions, /useSyncExternalStore/)
  for (const platform of ["Android", "iOS", "Windows", "macOS"]) {
    assert.ok(instructions.includes(platform), `missing ${platform} flow`)
  }
  assert.ok(instructions.includes("disabled={!subscriptionUrl}"))
  assert.doesNotMatch(instructions, /progressByStep|Прогресс настройки/)
  assert.match(instructions, /className="mt-auto grid shrink-0/)
  assert.match(home, /Приглашайте друзей/)
  assert.match(home, /Получайте \{formatBonusDaysLabel/)

  const instructionsPage = await readFile(
    path.join(root, "app/(dashboard)/instructions/page.tsx"),
    "utf8"
  )
  assert.doesNotMatch(instructionsPage, /PulsarAssetCard|\/hero\/pulsar\.gif/)
  assert.match(instructionsPage, /<Card className=/)
  assert.match(instructionsPage, /<SubscriptionStatusPoller/)
  assert.match(instructionsPage, /paymentStatus === "success"/)

  const referralMetrics = await readFile(
    path.join(root, "components/app/referrals-metrics.tsx"),
    "utf8"
  )
  const referrals = await readFile(
    path.join(root, "app/(dashboard)/referrals/page.tsx"),
    "utf8"
  )
  assert.match(referralMetrics, /label: "Награды"/)
  assert.match(referralMetrics, /icon: GiftIcon/)
  assert.doesNotMatch(referralMetrics, /CalendarPlusIcon/)
  assert.doesNotMatch(referralMetrics, /<Card/)
  assert.match(referralMetrics, /<PulsarIconContainer icon=\{UsersIcon\}/)
  assert.match(referralMetrics, /\{friendTrialLabel\} бесплатно/)
  assert.match(referralMetrics, /\+\{formatBonusDaysLabel\(ownerRewardDays\)\}/)
  assert.match(referralMetrics, /<Badge variant="secondary">/)
  assert.match(referralMetrics, /\{invitedValue\} приглашено/)
  assert.match(referralMetrics, /\{earnedDays\} бонусных дней/)
  assert.doesNotMatch(referralMetrics, /<Empty /)
  assert.doesNotMatch(referralMetrics, /Пока нет наград/)
  assert.doesNotMatch(referralMetrics, /hasRewards|return null/)
  assert.doesNotMatch(referralMetrics, /<PulsarActionRow/)
  assert.match(referralMetrics, /Условия реферальной программы/)
  assert.match(referralMetrics, /variant="outline"/)
  assert.match(referrals, /Ваша реферальная ссылка/)
  assert.match(referralMetrics, /Детальная аналитика/)
  assert.doesNotMatch(
    referralMetrics,
    /Приглашения, активные друзья и начисленные награды/
  )
  assert.match(referralMetrics, /<TabsList/)
  assert.match(referralMetrics, /<TabsTrigger/)
  assert.doesNotMatch(referrals, /<Carousel/)
  assert.match(
    instructions,
    /\/instructions\/app-store\/apple-country-region\.png/
  )
  assert.match(
    instructions,
    /\/instructions\/app-store\/apple-account-information\.png/
  )
  assert.match(instructions, /https:\/\/support\.apple\.com\/ru-ru\/118283/)
  assert.doesNotMatch(instructions, /region-account|region-country|журнал T2/)
  for (const step of [
    "Откройте приложение «Настройки».",
    "Нажмите на свое имя, а затем — «Контент и покупки».",
    "Нажмите «Просмотреть». Может потребоваться выполнить вход.",
    "Нажмите «Страна/регион».",
    "Выберите новую страну или регион.",
    "Нажмите «Изменить страну или регион».",
    "Выберите новую страну или регион, затем просмотрите положения и условия.",
    "Нажмите «Принимаю» в верхнем правом углу, затем снова нажмите «Принимаю» для подтверждения.",
  ]) {
    assert.ok(instructions.includes(step))
  }
  for (const step of [
    "Откройте приложение Apple Music или Apple TV.",
    "Возможно, вам придется войти в Аккаунт Apple.",
    "На странице «Информация об учетной записи» нажмите «Изменить страну или регион».",
    "Введите новую платежную информацию* и адрес выставления счетов, затем нажмите «Продолжить».",
  ]) {
    assert.ok(instructions.includes(step))
  }
  assert.doesNotMatch(instructions, /Перед изменением региона/)
  assert.equal(instructions.match(/<Card\b/g)?.length, 1)
  assert.match(instructions, /<ol className="flex list-decimal/)
  assert.match(instructions, /flex list-decimal flex-col gap-1/)
  assert.doesNotMatch(instructions, /<CardTitle>Шаг/)
  assert.match(instructions, /className="flex flex-1 items-center"/)
  assert.match(instructions, /spacing=\{3\}/)
  assert.match(instructions, /rounded-\[22px\]/)
  assert.match(instructions, /border-border\/70/)
  assert.match(instructions, /bg-transparent/)
})

test("authentication uses toast feedback and OTP auto-submit", async () => {
  const auth = await readFile(
    path.join(root, "components/auth/auth-card.tsx"),
    "utf8"
  )
  assert.match(auth, /toast\.error/)
  assert.match(auth, /onComplete=/)
  assert.match(auth, /setOtp\(""\)/)
  assert.match(auth, /Подключиться к Pulsar с помощью/)
  assert.doesNotMatch(auth, />Продолжить<\/Button>/)
  assert.doesNotMatch(auth, /<Alert/)
})

test("user routes keep accessible titles, headings, and navigation state", async () => {
  const navigation = await readFile(
    path.join(root, "components/app/bottom-nav.tsx"),
    "utf8"
  )
  assert.match(navigation, /aria-current=/)

  for (const route of routeFiles.filter(
    (route) =>
      route.startsWith("app/(dashboard)/") &&
      !route.endsWith("instructions/page.tsx")
  )) {
    const source = await readFile(path.join(root, route), "utf8")
    assert.match(source, /export const metadata/)
    assert.match(source, /<h1/)
  }

  const assetCard = await readFile(
    path.join(root, "components/app/pulsar-primitives.tsx"),
    "utf8"
  )
  assert.match(assetCard, /loading=["']eager["']/)
  assert.doesNotMatch(assetCard, /priority=/)

  const supportThread = await readFile(
    path.join(root, "components/app/support-thread.tsx"),
    "utf8"
  )
  assert.match(supportThread, /MessageScrollerContent/)
  assert.match(supportThread, /aria-live="polite"/)
})

test("legal documents remain readable", async () => {
  for (const document of ["agreement.md", "offer.md", "confidentiality.md"]) {
    const contents = await readFile(path.join(root, "docs", document), "utf8")
    assert.ok(contents.trim().length > 100)
  }
})

test("active frontend does not import obsolete mock fixtures", async () => {
  const activeFiles = (
    await Promise.all(
      ["app", "components", "hooks", "lib", "src/frontend-preview"].map(
        collectFiles
      )
    )
  ).flat()
  const forbiddenImports = ["fixtures/mock-", "backendUnavailableMessage"]
  const secretNames = [
    "DATA" + "BASE_URL",
    "SES" + "SION_" + "SECRET",
    "PLA" + "TEGA_" + "SECRET",
    "RE" + "SEND_" + "API_KEY",
    "TELEGRAM_" + "BOT_TOKEN",
    "REM" + "NAWAVE_" + "API_TOKEN",
  ]

  for (const file of activeFiles) {
    const source = await readFile(file, "utf8")
    for (const forbidden of [...forbiddenImports, ...secretNames]) {
      assert.ok(
        !source.includes(forbidden),
        `${path.relative(root, file)} contains ${forbidden}`
      )
    }
  }
})

test("required backend route handlers are present", async () => {
  const appFiles = await collectFiles("app")
  const routes = appFiles.filter((file) => path.basename(file) === "route.ts")
  for (const required of [
    "auth/email/request",
    "auth/email/verify",
    "integrations/telegram/webhook",
    "integrations/payments/webhook",
    "health/ready",
  ]) {
    assert.ok(
      routes.some((file) => file.replaceAll("\\", "/").includes(required)),
      `missing route ${required}`
    )
  }
})

test("wallet and payout runtime routes remain removed", async () => {
  for (const removed of [
    "app/api/wallet/payouts/route.ts",
    "app/api/admin/payouts/[id]/details/route.ts",
    "app/admin/(panel)/payouts/page.tsx",
  ]) {
    await assert.rejects(stat(path.join(root, removed)))
  }
})
