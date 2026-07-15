import { notFound, redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getConfig } from "@/src/server/config"
import { getSession } from "@/src/server/transport/web/session"
import { db } from "@/src/server/infrastructure/db/client"
import {
  createAndConfirmTestPayment,
  createTestPayout,
  createTestUser,
  deleteTestData,
  expireTestSubscriptions,
  requestTestOtp,
  resendDuplicatePaymentEvent,
  setProvisioningFailure,
  simulateReferralFirstPayment,
  simulateTelegramLogin,
} from "@/app/admin/test/actions"
import { decryptSensitive } from "@/src/server/infrastructure/security/crypto"

export default async function AdminTestPage() {
  const config = getConfig()
  if (!config.testMode) notFound()
  const session = await getSession("ADMIN")
  if (!session || session.user.role !== "ADMIN") redirect("/admin")
  const state = await db.systemState.findUnique({
    where: { key: "test_provisioning_failure" },
  })
  const failure = state
    ? Boolean((JSON.parse(state.valueJson) as { enabled?: boolean }).enabled)
    : false
  const users = await db.user.findMany({
    where: { isTest: true, role: "USER" },
    include: {
      identities: true,
      payments: { orderBy: { createdAt: "desc" }, take: 5 },
      subscription: true,
    },
    take: 30,
  })
  const latestOtpChallenge = await db.loginChallenge.findFirst({
    where: {
      channel: "EMAIL",
      emailNormalized: { endsWith: "@pulsar.local" },
      devOtpEncrypted: { not: null },
    },
    orderBy: { createdAt: "desc" },
  })
  const latestOtp = latestOtpChallenge?.devOtpEncrypted
    ? decryptSensitive(latestOtpChallenge.devOtpEncrypted)
    : null
  return (
    <main className="pulsar-admin-container">
      <div>
        <h1 className="text-2xl font-semibold">Test mode</h1>
        <p className="text-sm text-muted-foreground">
          Изолированные mock-инструменты
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Test user</CardTitle>
            <CardDescription>Только домен @pulsar.local</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTestUser} className="flex gap-2">
              <Input
                name="email"
                defaultValue="test-user@pulsar.local"
                required
              />
              <Button>Создать</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Test OTP</CardTitle>
            <CardDescription>
              {latestOtp
                ? `Последний код: ${latestOtp} · challenge ${latestOtpChallenge?.id}`
                : "Код ещё не запрашивался"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={requestTestOtp} className="flex gap-2">
              <Input
                name="email"
                defaultValue="otp-user@pulsar.local"
                required
              />
              <Button variant="outline">Получить OTP</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Provisioning</CardTitle>
            <CardDescription>
              Сейчас: {failure ? "FAIL" : "SUCCESS"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <form action={setProvisioningFailure}>
              <input
                type="hidden"
                name="enabled"
                value={failure ? "false" : "true"}
              />
              <Button variant="outline">
                {failure ? "Включить success" : "Включить failure"}
              </Button>
            </form>
            <form action={expireTestSubscriptions}>
              <Button variant="outline">Истечь test-подписки</Button>
            </form>
          </CardContent>
        </Card>
        {config.localAuthAdaptersEnabled ? (
          <Card>
            <CardHeader>
              <CardTitle>Telegram</CardTitle>
              <CardDescription>
                Создать challenge и обработать приватный mock update
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={simulateTelegramLogin}>
                <Button variant="outline">Симулировать Telegram login</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Test users</CardTitle>
          <CardDescription>{users.length} записей</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {users.map((user) => {
            const confirmed = user.payments.find(
              (payment) => payment.status === "CONFIRMED"
            )
            return (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <p className="text-sm">
                  {user.identities[0]?.providerSubject ?? user.id} ·{" "}
                  {user.subscription?.status ?? "NO SUB"} · payments{" "}
                  {user.payments.length}
                </p>
                <div className="flex flex-wrap gap-2">
                  <form action={createAndConfirmTestPayment}>
                    <input type="hidden" name="userId" value={user.id} />
                    <Button size="sm">Payment + confirm</Button>
                  </form>
                  {confirmed ? (
                    <form action={resendDuplicatePaymentEvent}>
                      <input
                        type="hidden"
                        name="paymentId"
                        value={confirmed.id}
                      />
                      <Button size="sm" variant="outline">
                        Duplicate webhook
                      </Button>
                    </form>
                  ) : null}
                  <form action={simulateReferralFirstPayment}>
                    <input type="hidden" name="userId" value={user.id} />
                    <Button size="sm" variant="outline">
                      Referral → first payment
                    </Button>
                  </form>
                  <form action={createTestPayout}>
                    <input type="hidden" name="userId" value={user.id} />
                    <Button size="sm" variant="outline">
                      Create payout
                    </Button>
                  </form>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Очистить test data</CardTitle>
          <CardDescription>
            Удаляются только USER-записи с isTest=true; admin и real data не
            затрагиваются.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={deleteTestData} className="flex flex-wrap gap-2">
            <Input
              name="confirmation"
              placeholder="DELETE TEST DATA"
              pattern="DELETE TEST DATA"
              required
            />
            <Button variant="destructive">Удалить test data</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
