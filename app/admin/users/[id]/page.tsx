import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { db } from "@/src/server/infrastructure/db/client"
import { getSession } from "@/src/server/transport/web/session"

export default async function AdminUserDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession("ADMIN")
  if (!session || session.user.role !== "ADMIN") redirect("/admin")
  const { id } = await params
  const [user, auditLogs] = await Promise.all([
    db.user.findUnique({
      where: { id },
      include: {
        identities: true,
        sessions: { orderBy: { createdAt: "desc" }, take: 20 },
        subscription: {
          include: { events: { orderBy: { createdAt: "desc" }, take: 50 } },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { webhookLogs: { orderBy: { receivedAt: "desc" } } },
        },
        referralProfile: true,
        invitedReferral: {
          include: {
            inviter: { include: { identities: true } },
            reward: true,
          },
        },
        sentInvites: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            invited: { include: { identities: true } },
            reward: true,
          },
        },
        wallet: {
          include: {
            ledgerEntries: { orderBy: { createdAt: "desc" }, take: 100 },
          },
        },
        payouts: { orderBy: { createdAt: "desc" }, take: 50 },
        supportConversation: {
          include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } },
        },
        telegramProfile: true,
      },
    }),
    db.auditLog.findMany({
      where: {
        OR: [{ actorId: id }, { entityType: "User", entityId: id }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ])
  if (!user || user.role !== "USER") notFound()

  return (
    <main className="pulsar-admin-container">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Пользователь</h1>
          <p className="font-mono text-xs text-muted-foreground">{user.id}</p>
        </div>
        <Button variant="outline" render={<Link href="/admin" />}>
          ← В admin
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <DetailsCard
          title="Account"
          description={`${user.status} · ${user.isTest ? "TEST" : "REAL"}`}
        >
          <p>Создан: {dateTime(user.createdAt)}</p>
          <p>
            Последний вход:{" "}
            {user.lastLoginAt ? dateTime(user.lastLoginAt) : "—"}
          </p>
          {user.identities.map((identity) => (
            <p key={identity.id}>
              {identity.provider}: {identity.providerSubject}
            </p>
          ))}
          <p>
            Telegram notifications:{" "}
            {user.telegramProfile?.transactionalNotificationsEnabled
              ? "on"
              : "off"}
          </p>
        </DetailsCard>
        <DetailsCard
          title="Subscription"
          description={user.subscription?.status ?? "Нет подписки"}
        >
          {user.subscription ? (
            <>
              <p>До: {dateTime(user.subscription.expiresAt)}</p>
              <p>
                Devices {user.subscription.deviceLimit} · LTE{" "}
                {user.subscription.lteEnabled ? "on" : "off"}
              </p>
              <p>
                Sync: {user.subscription.syncStatus} v
                {user.subscription.syncVersion}
              </p>
              {user.subscription.nextParametersAt ? (
                <p>
                  Следующий план с{" "}
                  {dateTime(user.subscription.nextParametersAt)}:{" "}
                  {user.subscription.nextDeviceLimit ??
                    user.subscription.deviceLimit}{" "}
                  devices, LTE{" "}
                  {(user.subscription.nextLteEnabled ??
                  user.subscription.lteEnabled)
                    ? "on"
                    : "off"}
                </p>
              ) : null}
            </>
          ) : null}
        </DetailsCard>
        <DetailsCard title="Wallet" description="Проекция immutable ledger">
          <p>Доступно: {(user.wallet?.availableMinor ?? 0) / 100} ₽</p>
          <p>Зарезервировано: {(user.wallet?.reservedMinor ?? 0) / 100} ₽</p>
        </DetailsCard>
        <DetailsCard
          title="Referral"
          description={user.referralProfile?.isEnabled ? "enabled" : "disabled"}
        >
          <p>Code: {user.referralProfile?.inviteCode ?? "—"}</p>
          <p>Invited users: {user.sentInvites.length}</p>
          <p>
            Inviter:{" "}
            {user.invitedReferral
              ? identityLabel(user.invitedReferral.inviter.identities)
              : "—"}
          </p>
        </DetailsCard>
      </div>

      <DetailsCard title="Sessions" description="Токены не отображаются">
        <CompactTable
          headers={["Kind", "Created", "Last seen", "Expires", "State"]}
          rows={user.sessions.map((item) => [
            item.kind,
            dateTime(item.createdAt),
            dateTime(item.lastSeenAt),
            dateTime(item.absoluteExpiresAt),
            item.revokedAt ? "REVOKED" : "ACTIVE",
          ])}
        />
      </DetailsCard>

      <DetailsCard
        title="Payments"
        description={`${user.payments.length} последних`}
      >
        <CompactTable
          headers={["ID", "State", "Amount", "Plan", "Webhooks"]}
          rows={user.payments.map((item) => [
            item.id,
            `${item.status}${item.isTest ? " · TEST" : ""}`,
            `${item.amountMinor / 100} ${item.currency}`,
            `${item.durationDays}d · ${item.deviceLimit} devices · LTE ${item.lteEnabled ? "on" : "off"}`,
            String(item.webhookLogs.length),
          ])}
        />
      </DetailsCard>

      <DetailsCard title="Subscription history" description="Immutable events">
        <CompactTable
          headers={["Time", "Type", "Payment"]}
          rows={(user.subscription?.events ?? []).map((item) => [
            dateTime(item.createdAt),
            item.type,
            item.paymentId ?? "—",
          ])}
        />
      </DetailsCard>

      <DetailsCard
        title="Wallet ledger / payouts"
        description={`${user.wallet?.ledgerEntries.length ?? 0} ledger entries · ${user.payouts.length} payouts`}
      >
        <CompactTable
          headers={["Time", "Type", "Available Δ", "Reserved Δ", "Reference"]}
          rows={(user.wallet?.ledgerEntries ?? []).map((item) => [
            dateTime(item.createdAt),
            item.type,
            `${item.deltaAvailableMinor / 100} ₽`,
            `${item.deltaReservedMinor / 100} ₽`,
            `${item.referenceType}:${item.referenceId}`,
          ])}
        />
      </DetailsCard>

      <DetailsCard
        title="Support"
        description={user.supportConversation?.status ?? "Нет диалога"}
      >
        <div className="space-y-2">
          {(user.supportConversation?.messages ?? []).map((message) => (
            <p key={message.id} className="rounded-xl bg-muted p-2 text-sm">
              <b>{message.authorRole}:</b> {message.body}
            </p>
          ))}
        </div>
      </DetailsCard>

      <DetailsCard
        title="Audit"
        description={`${auditLogs.length} последних событий`}
      >
        <CompactTable
          headers={["Time", "Actor", "Action", "Entity"]}
          rows={auditLogs.map((item) => [
            dateTime(item.createdAt),
            item.actorType,
            item.action,
            `${item.entityType}:${item.entityId ?? "—"}`,
          ])}
        />
      </DetailsCard>
    </main>
  )
}

function DetailsCard({
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
      <CardContent className="space-y-1 text-sm">{children}</CardContent>
    </Card>
  )
}

function CompactTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${index}:${row[0]}`}>
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={`${cellIndex}:${cell}`}
                  className="max-w-sm break-all"
                >
                  {cellIndex === 1 && /ACTIVE|CONFIRMED|SYNCED/.test(cell) ? (
                    <Badge variant="secondary">{cell}</Badge>
                  ) : (
                    cell
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 ? (
        <p className="py-4 text-muted-foreground">Нет записей.</p>
      ) : null}
    </div>
  )
}

function identityLabel(
  items: Array<{ provider: string; providerSubject: string }>
) {
  return (
    items.find((item) => item.provider === "EMAIL")?.providerSubject ??
    items[0]?.providerSubject ??
    "—"
  )
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(value)
}
