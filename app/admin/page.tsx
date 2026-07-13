import { AuthCard } from "@/components/auth/auth-card"
import { PayoutDetailsReveal } from "@/components/admin/payout-details-reveal"
import Link from "next/link"
import type { PaymentStatus, Prisma } from "@/src/generated/prisma/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { db } from "@/src/server/infrastructure/db/client"
import { getSession } from "@/src/server/transport/web/session"
import { getConfig } from "@/src/server/config"
import {
  adjustWallet,
  abandonUncertainCheckout,
  cancelBroadcast,
  createBroadcastDraft,
  extendSubscription,
  payoutAction,
  queueBroadcastDraft,
  reconcilePayment,
  regenerateSubscriptionUrl,
  replySupport,
  resolveReferralRewardReview,
  resolvePaymentFulfillmentReview,
  resolveRefundReview,
  retryJob,
  retryProvisioning,
  revokeUserSessions,
  setSupportStatus,
  setUserStatus,
  updatePricing,
} from "@/app/admin/actions"

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    page?: string
    tab?: string
    paymentStatus?: string
    subscriptionStatus?: string
  }>
}) {
  const session = await getSession("ADMIN")
  if (!session || session.user.role !== "ADMIN") return <AuthCard admin />
  const params = await searchParams
  const query = params.q?.trim().slice(0, 100) ?? ""
  const page = Math.max(1, Number(params.page) || 1)
  const now = new Date()
  const subscriptionStatus = [
    "ACTIVE",
    "TRIAL",
    "EXPIRED",
    "SYNC_FAILED",
    "NONE",
  ].includes(params.subscriptionStatus ?? "")
    ? params.subscriptionStatus!
    : ""
  const paymentStatus = [
    "CREATED",
    "PENDING",
    "CONFIRMED",
    "FAILED",
    "CANCELED",
    "EXPIRED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
  ].includes(params.paymentStatus ?? "")
    ? params.paymentStatus!
    : ""
  const userWhere: Prisma.UserWhereInput = {
    role: "USER",
    ...(subscriptionStatus === "NONE"
      ? { subscription: { is: null } }
      : subscriptionStatus === "EXPIRED"
        ? { subscription: { is: { expiresAt: { lte: now } } } }
        : subscriptionStatus === "SYNC_FAILED"
          ? { subscription: { is: { syncStatus: "FAILED" } } }
          : subscriptionStatus
            ? {
                subscription: {
                  is: {
                    status: subscriptionStatus as "ACTIVE" | "TRIAL",
                    expiresAt: { gt: now },
                  },
                },
              }
            : {}),
    ...(query
      ? {
          OR: [
            { id: { contains: query } },
            {
              identities: {
                some: {
                  OR: [
                    { providerSubject: { contains: query } },
                    { emailNormalized: { contains: query } },
                    { telegramId: { contains: query } },
                    { telegramUsername: { contains: query } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  }
  const day = new Date(now.getTime() - 86_400_000)
  const week = new Date(now.getTime() - 7 * 86_400_000)
  const month = new Date(now.getFullYear(), now.getMonth(), 1)
  const [
    users,
    payments,
    payouts,
    conversations,
    jobs,
    pricing,
    broadcasts,
    refundReviews,
    fulfillmentReviews,
    auditLogs,
    integrationLogs,
    totals,
  ] = await Promise.all([
    db.user.findMany({
      where: userWhere,
      include: { identities: true, subscription: true, wallet: true },
      orderBy: { createdAt: "desc" },
      take: 25,
      skip: (page - 1) * 25,
    }),
    db.payment.findMany({
      where: paymentStatus
        ? { status: paymentStatus as PaymentStatus }
        : undefined,
      include: { user: { include: { identities: true } }, webhookLogs: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.payoutRequest.findMany({
      include: { user: { include: { identities: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.supportConversation.findMany({
      include: {
        user: { include: { identities: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 50 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
    }),
    db.outboxJob.findMany({
      where: { status: { in: ["FAILED", "DEAD"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.pricingSettings.findUniqueOrThrow({ where: { key: "default" } }),
    db.telegramBroadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { deliveries: true },
    }),
    db.payment.findMany({
      where: {
        OR: [
          {
            AND: [
              { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
              {
                subscriptionEvents: {
                  some: { type: "REFUND_REVIEW_REQUIRED" },
                },
              },
              {
                subscriptionEvents: {
                  none: {
                    type: {
                      in: [
                        "REFUND_REVIEW_SUSPENDED",
                        "REFUND_REVIEW_KEPT_ACTIVE",
                      ],
                    },
                  },
                },
              },
            ],
          },
          { referralReward: { is: { status: "MANUAL_REVIEW" } } },
        ],
      },
      include: {
        user: { include: { identities: true, subscription: true } },
        referralReward: true,
        subscriptionEvents: {
          where: {
            type: {
              in: ["REFUND_REVIEW_SUSPENDED", "REFUND_REVIEW_KEPT_ACTIVE"],
            },
          },
          take: 1,
        },
      },
      orderBy: { refundedAt: "desc" },
      take: 50,
    }),
    db.payment.findMany({
      where: {
        status: "CONFIRMED",
        subscriptionEvents: {
          some: { type: "PAYMENT_FULFILLMENT_REVIEW_REQUIRED" },
          none: {
            type: {
              in: [
                "PAYMENT_FULFILLMENT_RESOLVED_STAGED_PLAN",
                "PAYMENT_FULFILLMENT_REFUND_REQUIRED",
              ],
            },
          },
        },
      },
      include: {
        user: { include: { identities: true, subscription: true } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 50,
    }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.integrationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    Promise.all([
      db.user.count({ where: { role: "USER" } }),
      db.user.count({ where: { createdAt: { gte: day }, role: "USER" } }),
      db.user.count({ where: { createdAt: { gte: week }, role: "USER" } }),
      db.subscription.count({
        where: { status: "ACTIVE", expiresAt: { gt: now } },
      }),
      db.subscription.count({
        where: { status: "TRIAL", expiresAt: { gt: now } },
      }),
      db.subscription.count({
        where: { expiresAt: { lte: now } },
      }),
      db.payment.aggregate({
        where: { status: "CONFIRMED", confirmedAt: { gte: day } },
        _sum: { amountMinor: true },
      }),
      db.payment.aggregate({
        where: { status: "CONFIRMED", confirmedAt: { gte: week } },
        _sum: { amountMinor: true },
      }),
      db.payment.aggregate({
        where: { status: "CONFIRMED", confirmedAt: { gte: month } },
        _sum: { amountMinor: true },
      }),
      db.payment.count({ where: { status: "PENDING" } }),
      db.payoutRequest.count({
        where: { status: { in: ["PENDING", "APPROVED"] } },
      }),
      db.supportConversation.count({ where: { status: "OPEN" } }),
      db.outboxJob.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
      db.outboxJob.groupBy({ by: ["status"], _count: { _all: true } }),
      db.systemState.findUnique({ where: { key: "worker_heartbeat" } }),
    ]),
  ])
  const [
    userCount,
    dayUsers,
    weekUsers,
    activeSubscriptions,
    trialSubscriptions,
    expiredSubscriptions,
    dayRevenue,
    weekRevenue,
    monthRevenue,
    pendingPayments,
    pendingPayouts,
    openSupport,
    failedJobs,
    outboxState,
    workerHeartbeat,
  ] = totals
  const heartbeatAt = workerHeartbeat
    ? (JSON.parse(workerHeartbeat.valueJson) as { at?: string }).at
    : undefined
  const outboxLabel = outboxState
    .map((item) => `${item.status}:${item._count._all}`)
    .join(" · ")
  const durationDiscounts = JSON.parse(pricing.durationDiscountsJson) as Record<
    string,
    number
  >
  return (
    <main className="pulsar-admin-container">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pulsar Admin</h1>
          <p className="text-sm text-muted-foreground">Операционная панель</p>
        </div>
        {getConfig().testMode ? (
          <Badge variant="secondary">TEST MODE</Badge>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Пользователи", userCount],
          ["Новые 24ч / 7д", `${dayUsers} / ${weekUsers}`],
          ["Активные подписки", activeSubscriptions],
          [
            "Trial / expired",
            `${trialSubscriptions} / ${expiredSubscriptions}`,
          ],
          [
            "Выручка 24ч / 7д / месяц",
            `${(dayRevenue._sum.amountMinor ?? 0) / 100} / ${(weekRevenue._sum.amountMinor ?? 0) / 100} / ${(monthRevenue._sum.amountMinor ?? 0) / 100} ₽`,
          ],
          [
            "Worker heartbeat",
            heartbeatAt ? dateTime(new Date(heartbeatAt)) : "нет",
          ],
          ["Outbox", outboxLabel || "пусто"],
          [
            "Требуют внимания",
            pendingPayments +
              pendingPayouts +
              openSupport +
              failedJobs +
              refundReviews.length +
              fulfillmentReviews.length,
          ],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Tabs
        defaultValue={
          [
            "users",
            "payments",
            "payouts",
            "support",
            "jobs",
            "reviews",
            "pricing",
            "telegram",
            "logs",
          ].includes(params.tab ?? "")
            ? params.tab
            : "users"
        }
      >
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="reviews">
            Reviews ({refundReviews.length + fulfillmentReviews.length})
          </TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="telegram">Telegram</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <AdminCard title="Пользователи" description="Последние 50">
            <form className="mb-3 flex gap-2" method="get">
              <input type="hidden" name="tab" value="users" />
              <Input
                name="q"
                defaultValue={query}
                placeholder="Email, Telegram ID, username или internal ID"
              />
              <Button type="submit" variant="outline">
                Найти
              </Button>
              <select
                name="subscriptionStatus"
                defaultValue={subscriptionStatus}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Все подписки</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="TRIAL">TRIAL</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="SYNC_FAILED">SYNC FAILED</option>
                <option value="NONE">NO SUBSCRIPTION</option>
              </select>
            </form>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identity</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Подписка</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      {identity(user.identities)}
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {user.id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{user.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {user.subscription
                        ? `${user.subscription.status} до ${date(user.subscription.expiresAt)}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <form action={setUserStatus}>
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={
                              user.status === "BLOCKED" ? "ACTIVE" : "BLOCKED"
                            }
                          />
                          <Button size="sm" variant="outline">
                            {user.status === "BLOCKED"
                              ? "Разблокировать"
                              : "Блокировать"}
                          </Button>
                        </form>
                        <form action={revokeUserSessions}>
                          <input type="hidden" name="userId" value={user.id} />
                          <Button size="sm" variant="outline">
                            Отозвать сессии
                          </Button>
                        </form>
                        <form
                          action={extendSubscription}
                          className="flex flex-wrap gap-1"
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="requestKey"
                            value={`${user.id}:extend:v${user.subscription?.syncVersion ?? 0}`}
                          />
                          <Input
                            name="days"
                            type="number"
                            defaultValue="30"
                            className="w-20"
                          />
                          <Input
                            name="deviceLimit"
                            type="number"
                            defaultValue={user.subscription?.deviceLimit ?? 1}
                            className="w-16"
                          />
                          <select
                            name="lteEnabled"
                            defaultValue={
                              user.subscription?.lteEnabled ? "true" : "false"
                            }
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                            aria-label="LTE"
                          >
                            <option value="false">LTE off</option>
                            <option value="true">LTE on</option>
                          </select>
                          <Button size="sm">Продлить</Button>
                        </form>
                        {user.subscription ? (
                          <form action={retryProvisioning}>
                            <input
                              type="hidden"
                              name="subscriptionId"
                              value={user.subscription.id}
                            />
                            <Button size="sm" variant="outline">
                              Provision
                            </Button>
                          </form>
                        ) : null}
                        {user.subscription?.remnawaveUserId ? (
                          <details className="rounded-md border px-2 py-1 text-xs">
                            <summary className="cursor-pointer">
                              Новая ссылка
                            </summary>
                            <p className="my-1 max-w-52 text-muted-foreground">
                              Старая ссылка перестанет работать. Устройства
                              нужно подключить заново.
                            </p>
                            <form action={regenerateSubscriptionUrl}>
                              <input
                                type="hidden"
                                name="subscriptionId"
                                value={user.subscription.id}
                              />
                              <Button size="sm" variant="destructive">
                                Подтвердить ротацию
                              </Button>
                            </form>
                          </details>
                        ) : null}
                        <form
                          action={adjustWallet}
                          className="flex flex-wrap gap-1"
                        >
                          <input type="hidden" name="userId" value={user.id} />
                          <input
                            type="hidden"
                            name="adjustmentKey"
                            value={`${user.id}:wallet-v${user.wallet?.version ?? 0}`}
                          />
                          <Input
                            name="deltaRub"
                            type="number"
                            step="0.01"
                            placeholder="± ₽"
                            className="w-20"
                            required
                          />
                          <Input
                            name="reason"
                            minLength={5}
                            maxLength={500}
                            placeholder="Причина"
                            className="w-32"
                            required
                          />
                          <Button size="sm" variant="outline">
                            Wallet
                          </Button>
                        </form>
                        <Button
                          size="sm"
                          variant="ghost"
                          render={<Link href={`/admin/users/${user.id}`} />}
                        >
                          Подробнее
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-between gap-2">
              <Link
                className="text-sm text-muted-foreground"
                href={`/admin?tab=users&page=${Math.max(1, page - 1)}&q=${encodeURIComponent(query)}&subscriptionStatus=${encodeURIComponent(subscriptionStatus)}`}
              >
                ← Назад
              </Link>
              <span className="text-sm">Страница {page}</span>
              <Link
                className="text-sm text-muted-foreground"
                href={`/admin?tab=users&page=${page + 1}&q=${encodeURIComponent(query)}&subscriptionStatus=${encodeURIComponent(subscriptionStatus)}`}
              >
                Далее →
              </Link>
            </div>
          </AdminCard>
        </TabsContent>
        <TabsContent value="payments">
          <AdminCard
            title="Платежи"
            description={`Pending: ${pendingPayments}`}
          >
            <form className="mb-3 flex gap-2" method="get">
              <input type="hidden" name="tab" value="payments" />
              <select
                name="paymentStatus"
                defaultValue={paymentStatus}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Все статусы</option>
                {[
                  "CREATED",
                  "PENDING",
                  "CONFIRMED",
                  "FAILED",
                  "CANCELED",
                  "EXPIRED",
                  "REFUNDED",
                  "PARTIALLY_REFUNDED",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline">
                Фильтр
              </Button>
            </form>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Webhook</TableHead>
                  <TableHead>Детали</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{payment.id}</TableCell>
                    <TableCell>{identity(payment.user.identities)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {payment.status}
                        {payment.isTest ? " · TEST" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>{payment.amountMinor / 100} ₽</TableCell>
                    <TableCell>{payment.webhookLogs.length}</TableCell>
                    <TableCell>
                      <details className="max-w-md text-xs">
                        <summary className="cursor-pointer">Открыть</summary>
                        <div className="mt-2 space-y-1 break-all">
                          <p>External: {payment.externalPaymentId ?? "—"}</p>
                          <p>
                            {payment.durationDays} дней · {payment.deviceLimit}{" "}
                            устройств · LTE {payment.lteEnabled ? "on" : "off"}
                          </p>
                          <p>Pricing v{payment.pricingVersion}</p>
                          <pre className="max-h-28 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">
                            {payment.priceSnapshotJson}
                          </pre>
                          {payment.webhookLogs.map((webhook) => (
                            <p key={webhook.id}>
                              {webhook.eventType} ·{" "}
                              {webhook.processingError ?? "processed"}
                            </p>
                          ))}
                          {payment.status === "PENDING" ? (
                            <form action={reconcilePayment}>
                              <input
                                type="hidden"
                                name="paymentId"
                                value={payment.id}
                              />
                              <Button size="sm" variant="outline">
                                Reconcile
                              </Button>
                            </form>
                          ) : null}
                          {payment.status === "CREATED" &&
                          !payment.externalPaymentId ? (
                            <form
                              action={abandonUncertainCheckout}
                              className="space-y-1 rounded-md border border-destructive/30 p-2"
                            >
                              <input
                                type="hidden"
                                name="paymentId"
                                value={payment.id}
                              />
                              <p>
                                Только после проверки отсутствия транзакции в
                                Platega.
                              </p>
                              <Input
                                name="reason"
                                minLength={10}
                                maxLength={500}
                                placeholder="Результат проверки у провайдера"
                                required
                              />
                              <Button size="sm" variant="destructive">
                                Закрыть uncertain checkout
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </details>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminCard>
        </TabsContent>
        <TabsContent value="payouts">
          <AdminCard title="Выплаты" description={`Ожидают: ${pendingPayouts}`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Реквизит</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>{identity(payout.user.identities)}</TableCell>
                    <TableCell>{payout.amountMinor / 100} ₽</TableCell>
                    <TableCell>
                      <PayoutDetailsReveal
                        payoutId={payout.id}
                        masked={payout.payoutDetailsMasked}
                      />
                    </TableCell>
                    <TableCell>{payout.status}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {payout.status === "PENDING" ? (
                          <ActionForm
                            action={payoutAction}
                            idName="payoutId"
                            id={payout.id}
                            value="APPROVE"
                            label="Approve"
                          />
                        ) : null}
                        {["PENDING", "APPROVED"].includes(payout.status) ? (
                          <ActionForm
                            action={payoutAction}
                            idName="payoutId"
                            id={payout.id}
                            value="REJECT"
                            label="Reject"
                          />
                        ) : null}
                        {payout.status === "APPROVED" ? (
                          <ActionForm
                            action={payoutAction}
                            idName="payoutId"
                            id={payout.id}
                            value="PAID"
                            label="Paid"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminCard>
        </TabsContent>
        <TabsContent value="support">
          <div className="grid gap-3">
            {conversations.map((conversation) => (
              <AdminCard
                key={conversation.id}
                title={identity(conversation.user.identities)}
                description={conversation.status}
              >
                <div className="flex flex-col gap-2">
                  {[...conversation.messages].reverse().map((message) => (
                    <p
                      key={message.id}
                      className="rounded-xl bg-muted p-2 text-sm"
                    >
                      <b>{message.authorRole}:</b> {message.body}
                    </p>
                  ))}
                  <form action={replySupport} className="flex gap-2">
                    <input
                      type="hidden"
                      name="conversationId"
                      value={conversation.id}
                    />
                    <Input
                      name="body"
                      required
                      minLength={2}
                      maxLength={1000}
                    />
                    <Button>Ответить</Button>
                  </form>
                  <form action={setSupportStatus}>
                    <input
                      type="hidden"
                      name="conversationId"
                      value={conversation.id}
                    />
                    <input
                      type="hidden"
                      name="status"
                      value={conversation.status === "OPEN" ? "CLOSED" : "OPEN"}
                    />
                    <Button variant="outline" size="sm">
                      {conversation.status === "OPEN" ? "Закрыть" : "Открыть"}
                    </Button>
                  </form>
                </div>
              </AdminCard>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="jobs">
          <AdminCard
            title="Failed/dead jobs"
            description={`Всего: ${failedJobs}`}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Тип</TableHead>
                  <TableHead>Попытки</TableHead>
                  <TableHead>Ошибка</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{job.type}</TableCell>
                    <TableCell>
                      {job.attempts}/{job.maxAttempts}
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {job.lastError}
                    </TableCell>
                    <TableCell>
                      <form action={retryJob}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <Button size="sm">Retry</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminCard>
        </TabsContent>
        <TabsContent value="reviews">
          <AdminCard
            title="Payment fulfillment review"
            description="Подтверждённые платежи, которые нельзя безопасно применить автоматически"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment / user</TableHead>
                  <TableHead>Купленный план</TableHead>
                  <TableHead>Текущий staged plan</TableHead>
                  <TableHead>Решение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fulfillmentReviews.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{payment.id}</span>
                      <br />
                      {identity(payment.user.identities)}
                    </TableCell>
                    <TableCell>
                      {payment.durationDays}d · {payment.deviceLimit} devices ·
                      LTE {payment.lteEnabled ? "on" : "off"}
                    </TableCell>
                    <TableCell>
                      {payment.user.subscription
                        ? `${payment.user.subscription.nextDeviceLimit ?? payment.user.subscription.deviceLimit} devices · LTE ${(payment.user.subscription.nextLteEnabled ?? payment.user.subscription.lteEnabled) ? "on" : "off"}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <form
                        action={resolvePaymentFulfillmentReview}
                        className="flex flex-wrap gap-1"
                      >
                        <input
                          type="hidden"
                          name="paymentId"
                          value={payment.id}
                        />
                        <Input
                          name="reason"
                          minLength={10}
                          maxLength={500}
                          placeholder="Operator decision / compensation"
                          className="w-52"
                          required
                        />
                        <Button
                          size="sm"
                          name="decision"
                          value="EXTEND_STAGED_PLAN"
                          variant="outline"
                        >
                          Продлить staged plan
                        </Button>
                        <Button
                          size="sm"
                          name="decision"
                          value="REFUND_REQUIRED"
                          variant="destructive"
                        >
                          Требуется refund
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {fulfillmentReviews.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Очередь пуста.
              </p>
            ) : null}
          </AdminCard>
          <AdminCard
            title="Refund / manual review"
            description="Последние 50 нерешённых возвратов"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Причина</TableHead>
                  <TableHead>Подписка</TableHead>
                  <TableHead>Решение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refundReviews.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <span className="font-mono text-xs">{payment.id}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {dateTime(payment.refundedAt ?? payment.updatedAt)}
                      </span>
                    </TableCell>
                    <TableCell>{identity(payment.user.identities)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">{payment.status}</Badge>
                        {payment.referralReward?.status === "MANUAL_REVIEW" ? (
                          <Badge variant="outline">REWARD MANUAL_REVIEW</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {payment.user.subscription ? (
                        <>
                          {payment.user.subscription.status}
                          <br />
                          <span className="text-xs text-muted-foreground">
                            до {date(payment.user.subscription.expiresAt)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {payment.subscriptionEvents.length === 0 ? (
                          <>
                            <RefundReviewForm
                              paymentId={payment.id}
                              decision="SUSPEND"
                              label="Приостановить"
                              destructive
                            />
                            <RefundReviewForm
                              paymentId={payment.id}
                              decision="KEEP_ACTIVE"
                              label="Оставить активной"
                            />
                          </>
                        ) : null}
                        {payment.referralReward?.status === "MANUAL_REVIEW" ? (
                          <RewardReviewForm paymentId={payment.id} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {refundReviews.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Очередь пуста.
              </p>
            ) : null}
          </AdminCard>
        </TabsContent>
        <TabsContent value="pricing">
          <AdminCard title="Pricing" description={`Version ${pricing.version}`}>
            <form action={updatePricing} className="grid gap-3 sm:grid-cols-3">
              {[
                ["base", "База, ₽", pricing.baseMonthlyPriceMinor / 100],
                [
                  "extra",
                  "Устройство, ₽",
                  pricing.extraDeviceMonthlyPriceMinor / 100,
                ],
                ["lte", "LTE, ₽", pricing.lteMonthlyPriceMinor / 100],
                ["reward", "Reward, ₽", pricing.referralRewardMinor / 100],
                ["trialDays", "Trial, дней", pricing.referralTrialDays],
                ["payout", "Min payout, ₽", pricing.minimalPayoutMinor / 100],
                ["minDevices", "Min devices", pricing.minDeviceLimit],
                ["maxDevices", "Max devices", pricing.maxDeviceLimit],
                ["discount1", "Discount 1m, %", durationDiscounts["1"] ?? 0],
                ["discount3", "Discount 3m, %", durationDiscounts["3"] ?? 0],
                ["discount6", "Discount 6m, %", durationDiscounts["6"] ?? 0],
                ["discount12", "Discount 12m, %", durationDiscounts["12"] ?? 0],
              ].map(([name, label, value]) => (
                <label key={String(name)} className="text-sm">
                  {label}
                  <Input
                    name={String(name)}
                    type="number"
                    defaultValue={Number(value)}
                    required
                  />
                </label>
              ))}
              <Button className="sm:col-span-3">Сохранить</Button>
            </form>
          </AdminCard>
        </TabsContent>
        <TabsContent value="telegram">
          <AdminCard
            title="Рассылка"
            description="Только opt-in или все доступные"
          >
            <form action={createBroadcastDraft} className="flex flex-col gap-3">
              <input
                type="hidden"
                name="requestKey"
                value={`broadcast:${broadcasts[0]?.id ?? "none"}:${broadcasts.length}`}
              />
              <Input name="title" placeholder="Заголовок" required />
              <Input name="body" placeholder="Текст" required />
              <select
                name="target"
                className="h-9 rounded-md border bg-background px-3"
              >
                <option value="NEWS_OPTED_IN">NEWS_OPTED_IN</option>
                <option value="ALL_REACHABLE">ALL_REACHABLE</option>
              </select>
              <Button>Сохранить draft</Button>
            </form>
            <div className="mt-4 flex flex-col gap-2">
              {broadcasts.map((item) => (
                <div key={item.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-semibold">
                    {item.title} · {item.status} · {item.target}
                  </p>
                  <p className="my-2 whitespace-pre-wrap text-muted-foreground">
                    {item.body}
                  </p>
                  <p>
                    {item.deliveries.filter((d) => d.status === "SENT").length}/
                    {item.deliveries.length} sent ·{" "}
                    {
                      item.deliveries.filter((d) => d.status === "FAILED")
                        .length
                    }{" "}
                    failed ·{" "}
                    {
                      item.deliveries.filter((d) => d.status === "SKIPPED")
                        .length
                    }{" "}
                    skipped
                  </p>
                  {item.status === "DRAFT" ? (
                    <div className="mt-2 flex gap-2">
                      <form action={queueBroadcastDraft}>
                        <input
                          type="hidden"
                          name="broadcastId"
                          value={item.id}
                        />
                        <Button size="sm">Поставить в очередь</Button>
                      </form>
                      <form action={cancelBroadcast}>
                        <input
                          type="hidden"
                          name="broadcastId"
                          value={item.id}
                        />
                        <Button size="sm" variant="outline">
                          Отменить
                        </Button>
                      </form>
                    </div>
                  ) : item.status === "QUEUED" ? (
                    <form action={cancelBroadcast} className="mt-2">
                      <input type="hidden" name="broadcastId" value={item.id} />
                      <Button size="sm" variant="outline">
                        Отменить до старта
                      </Button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </AdminCard>
        </TabsContent>
        <TabsContent value="logs">
          <div className="grid gap-3">
            <AdminCard
              title="Audit log"
              description="Последние 100 административных и системных событий"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Действие</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Metadata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{dateTime(log.createdAt)}</TableCell>
                      <TableCell>
                        {log.actorType}
                        {log.actorId ? ` · ${short(log.actorId, 24)}` : ""}
                      </TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell>
                        {log.entityType}
                        {log.entityId ? ` · ${short(log.entityId, 24)}` : ""}
                      </TableCell>
                      <TableCell className="max-w-md truncate font-mono text-xs">
                        {short(log.metadataJson, 240)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminCard>
            <AdminCard
              title="Integration log"
              description="Последние 100 внешних вызовов"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Интеграция</TableHead>
                    <TableHead>Операция</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Детали</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integrationLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{dateTime(log.createdAt)}</TableCell>
                      <TableCell>{log.integration}</TableCell>
                      <TableCell>{log.operation}</TableCell>
                      <TableCell>
                        <Badge variant={log.success ? "secondary" : "outline"}>
                          {log.success ? "OK" : "ERROR"} · {log.attempt}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.entityType ?? "—"}
                        {log.entityId ? ` · ${short(log.entityId, 24)}` : ""}
                      </TableCell>
                      <TableCell className="max-w-md truncate font-mono text-xs">
                        {short(
                          log.technicalError ??
                            log.responseSummary ??
                            log.requestSummary,
                          240
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminCard>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  )
}

function AdminCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
function identity(items: Array<{ provider: string; providerSubject: string }>) {
  return (
    items.find((item) => item.provider === "EMAIL")?.providerSubject ??
    items.find((item) => item.provider === "TELEGRAM")?.providerSubject ??
    "—"
  )
}
function date(value: Date) {
  return new Intl.DateTimeFormat("ru-RU").format(value)
}
function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(value)
}
function short(value: string | null, limit: number) {
  if (!value) return "—"
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}
function RefundReviewForm({
  paymentId,
  decision,
  label,
  destructive = false,
}: {
  paymentId: string
  decision: "SUSPEND" | "KEEP_ACTIVE"
  label: string
  destructive?: boolean
}) {
  return (
    <form action={resolveRefundReview}>
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="decision" value={decision} />
      <Button size="sm" variant={destructive ? "destructive" : "outline"}>
        {label}
      </Button>
    </form>
  )
}
function RewardReviewForm({ paymentId }: { paymentId: string }) {
  return (
    <form
      action={resolveReferralRewardReview}
      className="flex flex-wrap items-center gap-1"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <Input
        name="reason"
        minLength={5}
        maxLength={500}
        placeholder="Accounting reason"
        className="h-8 w-40"
        required
      />
      <Button size="sm" name="decision" value="CLAWBACK" variant="outline">
        Clawback
      </Button>
      <Button size="sm" name="decision" value="WRITE_OFF" variant="outline">
        Write-off
      </Button>
    </form>
  )
}
function ActionForm({
  action,
  idName,
  id,
  value,
  label,
}: {
  action: (formData: FormData) => Promise<void>
  idName: string
  id: string
  value: string
  label: string
}) {
  return (
    <form action={action}>
      <input type="hidden" name={idName} value={id} />
      <input type="hidden" name="action" value={value} />
      <Button size="sm" variant="outline">
        {label}
      </Button>
    </form>
  )
}
