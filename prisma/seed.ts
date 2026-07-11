import {
  AuthProvider,
  NodeProtocol,
  NodeStatus,
  NodeType,
  PaymentProvider,
  PaymentStatus,
  ReferralInviteStatus,
  SubscriptionStatus,
  SubscriptionSyncStatus,
  UserRole,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
} from "@/generated/prisma/client"

import { prisma } from "@/lib/db"

const now = new Date()

async function seedUser(
  id: string,
  email: string,
  role: UserRole = UserRole.USER,
  balanceRub = 0
) {
  const user = await prisma.user.upsert({
    where: { id },
    update: { role, balanceRub },
    create: { id, role, balanceRub },
  })

  await prisma.authIdentity.upsert({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.EMAIL,
        providerSubject: email,
      },
    },
    update: { userId: user.id, verifiedAt: now },
    create: {
      userId: user.id,
      provider: AuthProvider.EMAIL,
      providerSubject: email,
      verifiedAt: now,
    },
  })
  await prisma.referralProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, inviteCode: `invite-${id}` },
  })

  return user
}

async function main() {
  const admin = await seedUser("seed-admin", "admin@pulsarr.space", UserRole.ADMIN)
  const user = await seedUser("seed-user", "user@pulsarr.space")
  const activeUser = await seedUser("seed-active", "active@pulsarr.space", UserRole.USER, 225)
  const expiredUser = await seedUser("seed-expired", "expired@pulsarr.space")

  await prisma.authIdentity.upsert({
    where: {
      provider_providerSubject: {
        provider: AuthProvider.TELEGRAM,
        providerSubject: "100000001",
      },
    },
    update: { userId: activeUser.id },
    create: {
      userId: activeUser.id,
      provider: AuthProvider.TELEGRAM,
      providerSubject: "100000001",
      verifiedAt: now,
    },
  })

  const pricing = await prisma.pricingVersion.upsert({
    where: { version: 1 },
    update: {},
    create: {
      version: 1,
      status: "ACTIVE",
      baseMonthlyPriceRub: 119,
      extraDeviceMonthlyPriceRub: 15,
      minDeviceLimit: 1,
      maxDeviceLimit: 5,
      lteMonthlyPriceRub: 50,
      durationDiscounts: [
        { months: 1, discountPct: 0 },
        { months: 3, discountPct: 10 },
        { months: 6, discountPct: 15 },
        { months: 12, discountPct: 30 },
      ],
      referralFriendDiscountPct: 50,
      referralRewardRub: 75,
      minimalPayoutRub: 150,
      effectiveAt: now,
    },
  })

  const activeExpiresAt = new Date(now)
  activeExpiresAt.setMonth(activeExpiresAt.getMonth() + 2)
  const expiredAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const activeSubscription = await prisma.subscription.upsert({
    where: { userId: activeUser.id },
    update: {
      status: SubscriptionStatus.ACTIVE,
      expiresAt: activeExpiresAt,
    },
    create: {
      userId: activeUser.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: now,
      expiresAt: activeExpiresAt,
      deviceLimit: 3,
      lteEnabled: true,
      remnawaveUserId: "mock-rw-seed-active",
      subscriptionUrl: "https://pulsarr.space/sub/mock-rw-seed-active",
      syncStatus: SubscriptionSyncStatus.SYNCED,
    },
  })
  await prisma.subscription.upsert({
    where: { userId: expiredUser.id },
    update: { status: SubscriptionStatus.EXPIRED, expiresAt: expiredAt },
    create: {
      userId: expiredUser.id,
      status: SubscriptionStatus.EXPIRED,
      startsAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
      expiresAt: expiredAt,
      deviceLimit: 1,
    },
  })

  const quote = await prisma.priceQuote.upsert({
    where: { idempotencyKey: "seed:quote:active" },
    update: {},
    create: {
      userId: activeUser.id,
      pricingVersionId: pricing.id,
      durationMonths: 3,
      deviceLimit: 3,
      lteEnabled: true,
      subtotalRub: 507,
      discountRub: 51,
      totalRub: 456,
      pricingSnapshot: { seed: true },
      idempotencyKey: "seed:quote:active",
      expiresAt: activeExpiresAt,
      consumedAt: now,
    },
  })
  const payment = await prisma.payment.upsert({
    where: { idempotencyKey: "seed:payment:active" },
    update: {},
    create: {
      userId: activeUser.id,
      quoteId: quote.id,
      provider: PaymentProvider.MOCK,
      status: PaymentStatus.SUCCEEDED,
      amountRub: 456,
      durationMonths: 3,
      deviceLimit: 3,
      lteEnabled: true,
      idempotencyKey: "seed:payment:active",
      externalPaymentId: "mock-seed-active",
      confirmedAt: now,
    },
  })
  await prisma.subscriptionPeriod.upsert({
    where: { paymentId: payment.id },
    update: {},
    create: {
      subscriptionId: activeSubscription.id,
      paymentId: payment.id,
      startsAt: now,
      endsAt: activeExpiresAt,
      deviceLimit: 3,
      lteEnabled: true,
      amountRub: payment.amountRub,
    },
  })

  await prisma.referralProfile.update({
    where: { userId: activeUser.id },
    data: { isEnabled: true, enabledAt: now },
  })
  const invite = await prisma.referralInvite.upsert({
    where: { invitedUserId: user.id },
    update: {},
    create: {
      inviterId: activeUser.id,
      invitedUserId: user.id,
      inviteCodeSnapshot: "invite-seed-active",
      status: ReferralInviteStatus.REGISTERED,
    },
  })

  await prisma.walletLedgerEntry.upsert({
    where: { idempotencyKey: "seed:wallet:reward" },
    update: {},
    create: {
      userId: activeUser.id,
      direction: WalletLedgerDirection.CREDIT,
      amountRub: 225,
      type: WalletLedgerType.ADMIN_ADJUSTMENT,
      status: WalletLedgerStatus.POSTED,
      postedAt: now,
      idempotencyKey: "seed:wallet:reward",
      metadata: { inviteId: invite.id },
    },
  })
  await prisma.payoutRequest.upsert({
    where: { idempotencyKey: "seed:payout:active" },
    update: {},
    create: {
      userId: activeUser.id,
      amountRub: 150,
      payoutDetails: "Банк: тест; Реквизит: +79990000000",
      idempotencyKey: "seed:payout:active",
    },
  })

  const conversation = await prisma.supportConversation.findFirst({
    where: { userId: activeUser.id, status: "OPEN" },
  }) ?? await prisma.supportConversation.create({
    data: { userId: activeUser.id, subject: "Тестовый чат", lastMessageAt: now },
  })
  await prisma.supportMessage.upsert({
    where: { idempotencyKey: "seed:support:user" },
    update: {},
    create: {
      conversationId: conversation.id,
      senderId: activeUser.id,
      authorRole: "USER",
      body: "Нужна помощь с подключением.",
      idempotencyKey: "seed:support:user",
    },
  })
  await prisma.supportMessage.upsert({
    where: { idempotencyKey: "seed:support:admin" },
    update: {},
    create: {
      conversationId: conversation.id,
      senderId: admin.id,
      authorRole: "ADMIN",
      body: "Проверяем настройки.",
      idempotencyKey: "seed:support:admin",
    },
  })

  const nodes = [
    ["Moscow", "RU", "Moscow", NodeType.REGULAR, NodeProtocol.VLESS_REALITY, "ru-1.pulsarr.space", NodeStatus.ACTIVE],
    ["LTE", "NL", "Amsterdam", NodeType.LTE, NodeProtocol.VLESS_XHTTP_TLS, "nl-lte.pulsarr.space", NodeStatus.ACTIVE],
  ] as const
  for (const [name, country, city, type, protocol, domain, status] of nodes) {
    await prisma.node.upsert({
      where: { domain },
      update: { status },
      create: { name, country, city, type, protocol, domain, status, capacity: 1000 },
    })
  }

  await prisma.auditEvent.upsert({
    where: { idempotencyKey: "seed:audit" },
    update: {},
    create: {
      actorUserId: admin.id,
      eventType: "seed.completed",
      entityType: "System",
      idempotencyKey: "seed:audit",
    },
  })
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
