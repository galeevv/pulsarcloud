import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"
import {
  AuthIdentityType,
  IntegrationLogStatus,
  IntegrationProvider,
  NodeProtocol,
  NodeStatus,
  NodeType,
  PaymentProviderType,
  PaymentStatus,
  PayoutRequestStatus,
  PrismaClient,
  ReferralInviteStatus,
  ReferralRewardStatus,
  SubscriptionFeatureType,
  SubscriptionStatus,
  SubscriptionSyncStatus,
  SupportConversationStatus,
  SupportMessageAuthorRole,
  UserRole,
  WalletLedgerDirection,
  WalletLedgerStatus,
  WalletLedgerType,
} from "@prisma/client"

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://pulsar:pulsar@localhost:5432/pulsar2?schema=public"

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const now = new Date()
const daysFromNow = (days: number) =>
  new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

async function upsertEmailIdentity(userId: string, email: string) {
  await prisma.authIdentity.upsert({
    where: {
      type_identifier: {
        type: AuthIdentityType.EMAIL,
        identifier: email,
      },
    },
    update: {
      userId,
      verifiedAt: now,
    },
    create: {
      userId,
      type: AuthIdentityType.EMAIL,
      identifier: email,
      verifiedAt: now,
    },
  })
}

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@pulsarr.space" },
    update: {
      role: UserRole.ADMIN,
      balanceRub: 0,
    },
    create: {
      id: "seed_admin",
      email: "admin@pulsarr.space",
      role: UserRole.ADMIN,
      balanceRub: 0,
    },
  })

  const user = await prisma.user.upsert({
    where: { email: "user@pulsarr.space" },
    update: {
      role: UserRole.USER,
      balanceRub: 0,
    },
    create: {
      id: "seed_user",
      email: "user@pulsarr.space",
      role: UserRole.USER,
      balanceRub: 0,
    },
  })

  const activeUser = await prisma.user.upsert({
    where: { email: "active@pulsarr.space" },
    update: {
      telegramId: "885112484",
      role: UserRole.USER,
      balanceRub: 150,
    },
    create: {
      id: "seed_active_user",
      email: "active@pulsarr.space",
      telegramId: "885112484",
      role: UserRole.USER,
      balanceRub: 150,
    },
  })

  const expiredUser = await prisma.user.upsert({
    where: { email: "expired@pulsarr.space" },
    update: {
      role: UserRole.USER,
      balanceRub: 0,
    },
    create: {
      id: "seed_expired_user",
      email: "expired@pulsarr.space",
      role: UserRole.USER,
      balanceRub: 0,
    },
  })

  for (const item of [admin, user, activeUser, expiredUser]) {
    if (item.email) {
      await upsertEmailIdentity(item.id, item.email)
    }
  }

  await prisma.authIdentity.upsert({
    where: {
      type_identifier: {
        type: AuthIdentityType.TELEGRAM,
        identifier: "885112484",
      },
    },
    update: {
      userId: activeUser.id,
      verifiedAt: now,
    },
    create: {
      userId: activeUser.id,
      type: AuthIdentityType.TELEGRAM,
      identifier: "885112484",
      verifiedAt: now,
    },
  })

  await prisma.pricingSettings.upsert({
    where: { id: "default" },
    update: {
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
    },
    create: {
      id: "default",
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
    },
  })

  const activeSubscription = await prisma.subscription.upsert({
    where: { id: "seed_subscription_active" },
    update: {
      userId: activeUser.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: daysFromNow(-10),
      expiresAt: daysFromNow(20),
      deviceLimit: 3,
      lteEnabled: true,
      subscriptionUrl: "https://pulsarr.space/sub/seed-active-user",
      remnawaveUserId: "mock-rw-active-user",
      syncStatus: SubscriptionSyncStatus.SYNCED,
      lastUserFriendlyError: null,
      lastTechnicalError: null,
    },
    create: {
      id: "seed_subscription_active",
      userId: activeUser.id,
      status: SubscriptionStatus.ACTIVE,
      startsAt: daysFromNow(-10),
      expiresAt: daysFromNow(20),
      deviceLimit: 3,
      lteEnabled: true,
      subscriptionUrl: "https://pulsarr.space/sub/seed-active-user",
      remnawaveUserId: "mock-rw-active-user",
      syncStatus: SubscriptionSyncStatus.SYNCED,
    },
  })

  await prisma.subscription.upsert({
    where: { id: "seed_subscription_expired" },
    update: {
      userId: expiredUser.id,
      status: SubscriptionStatus.EXPIRED,
      startsAt: daysFromNow(-45),
      expiresAt: daysFromNow(-5),
      deviceLimit: 2,
      lteEnabled: false,
      subscriptionUrl: "https://pulsarr.space/sub/seed-expired-user",
      remnawaveUserId: "mock-rw-expired-user",
      syncStatus: SubscriptionSyncStatus.SYNCED,
    },
    create: {
      id: "seed_subscription_expired",
      userId: expiredUser.id,
      status: SubscriptionStatus.EXPIRED,
      startsAt: daysFromNow(-45),
      expiresAt: daysFromNow(-5),
      deviceLimit: 2,
      lteEnabled: false,
      subscriptionUrl: "https://pulsarr.space/sub/seed-expired-user",
      remnawaveUserId: "mock-rw-expired-user",
      syncStatus: SubscriptionSyncStatus.SYNCED,
    },
  })

  for (const feature of [
    {
      type: SubscriptionFeatureType.REGULAR_ACCESS,
      label: "Основные VPN-профили",
    },
    {
      type: SubscriptionFeatureType.LTE_ACCESS,
      label: "LTE add-on",
    },
  ]) {
    await prisma.subscriptionFeature.upsert({
      where: {
        subscriptionId_type: {
          subscriptionId: activeSubscription.id,
          type: feature.type,
        },
      },
      update: {
        label: feature.label,
        enabled: true,
      },
      create: {
        subscriptionId: activeSubscription.id,
        type: feature.type,
        label: feature.label,
        enabled: true,
      },
    })
  }

  await prisma.payment.upsert({
    where: { id: "seed_payment_confirmed" },
    update: {
      userId: activeUser.id,
      provider: PaymentProviderType.MOCK,
      status: PaymentStatus.CONFIRMED,
      amountRub: 387,
      durationMonths: 3,
      deviceLimit: 3,
      lteEnabled: true,
      confirmedAt: daysFromNow(-10),
      checkoutUrl: "mock://payment/seed_payment_confirmed",
    },
    create: {
      id: "seed_payment_confirmed",
      userId: activeUser.id,
      provider: PaymentProviderType.MOCK,
      status: PaymentStatus.CONFIRMED,
      amountRub: 387,
      durationMonths: 3,
      deviceLimit: 3,
      lteEnabled: true,
      confirmedAt: daysFromNow(-10),
      checkoutUrl: "mock://payment/seed_payment_confirmed",
    },
  })

  await prisma.payment.upsert({
    where: { id: "seed_payment_pending" },
    update: {
      userId: user.id,
      provider: PaymentProviderType.MOCK,
      status: PaymentStatus.PENDING,
      amountRub: 119,
      durationMonths: 1,
      deviceLimit: 1,
      lteEnabled: false,
      checkoutUrl: "mock://payment/seed_payment_pending",
    },
    create: {
      id: "seed_payment_pending",
      userId: user.id,
      provider: PaymentProviderType.MOCK,
      status: PaymentStatus.PENDING,
      amountRub: 119,
      durationMonths: 1,
      deviceLimit: 1,
      lteEnabled: false,
      checkoutUrl: "mock://payment/seed_payment_pending",
    },
  })

  const ledgerEntries = [
    {
      id: "seed_ledger_referral_reward",
      userId: activeUser.id,
      direction: WalletLedgerDirection.CREDIT,
      amountRub: 300,
      type: WalletLedgerType.REFERRAL_REWARD,
      idempotencyKey: "seed:referral_reward",
    },
    {
      id: "seed_ledger_payout_reserve",
      userId: activeUser.id,
      direction: WalletLedgerDirection.DEBIT,
      amountRub: 150,
      type: WalletLedgerType.PAYOUT_RESERVE,
      idempotencyKey: "seed:payout_reserve",
    },
  ]

  for (const entry of ledgerEntries) {
    await prisma.walletLedgerEntry.upsert({
      where: { id: entry.id },
      update: {
        userId: entry.userId,
        direction: entry.direction,
        amountRub: entry.amountRub,
        type: entry.type,
        status: WalletLedgerStatus.POSTED,
        idempotencyKey: entry.idempotencyKey,
      },
      create: {
        ...entry,
        status: WalletLedgerStatus.POSTED,
      },
    })
  }

  for (const profile of [
    {
      userId: user.id,
      inviteCode: "1726795",
      inviteUrl: "https://pulsarr.space/?invite=1726795",
      isEnabled: false,
    },
    {
      userId: activeUser.id,
      inviteCode: "8851124",
      inviteUrl: "https://pulsarr.space/?invite=8851124",
      isEnabled: true,
    },
  ]) {
    await prisma.referralProfile.upsert({
      where: { userId: profile.userId },
      update: {
        inviteCode: profile.inviteCode,
        inviteUrl: profile.inviteUrl,
        isEnabled: profile.isEnabled,
        enabledAt: profile.isEnabled ? daysFromNow(-10) : null,
      },
      create: {
        ...profile,
        enabledAt: profile.isEnabled ? daysFromNow(-10) : null,
      },
    })
  }

  await prisma.referralInvite.upsert({
    where: { invitedUserId: user.id },
    update: {
      inviterId: activeUser.id,
      status: ReferralInviteStatus.REGISTERED,
    },
    create: {
      id: "seed_referral_invite",
      inviterId: activeUser.id,
      invitedUserId: user.id,
      status: ReferralInviteStatus.REGISTERED,
    },
  })

  await prisma.referralReward.upsert({
    where: { id: "seed_referral_reward" },
    update: {
      inviterId: activeUser.id,
      invitedUserId: user.id,
      paymentId: null,
      amountRub: 75,
      status: ReferralRewardStatus.AVAILABLE,
      availableAt: daysFromNow(-3),
    },
    create: {
      id: "seed_referral_reward",
      inviterId: activeUser.id,
      invitedUserId: user.id,
      amountRub: 75,
      status: ReferralRewardStatus.AVAILABLE,
      availableAt: daysFromNow(-3),
    },
  })

  await prisma.payoutRequest.upsert({
    where: { id: "seed_payout_pending" },
    update: {
      userId: activeUser.id,
      amountRub: 150,
      status: PayoutRequestStatus.PENDING,
      payoutDetails: "СБП: +7 900 000-00-00",
      adminNote: null,
    },
    create: {
      id: "seed_payout_pending",
      userId: activeUser.id,
      amountRub: 150,
      status: PayoutRequestStatus.PENDING,
      payoutDetails: "СБП: +7 900 000-00-00",
    },
  })

  const conversation = await prisma.supportConversation.upsert({
    where: { id: "seed_support_conversation" },
    update: {
      userId: activeUser.id,
      status: SupportConversationStatus.OPEN,
      subject: "Настройка Happ",
      lastMessageAt: daysFromNow(-1),
    },
    create: {
      id: "seed_support_conversation",
      userId: activeUser.id,
      status: SupportConversationStatus.OPEN,
      subject: "Настройка Happ",
      lastMessageAt: daysFromNow(-1),
    },
  })

  for (const message of [
    {
      id: "seed_support_message_user",
      senderId: activeUser.id,
      authorRole: SupportMessageAuthorRole.USER,
      body: "Не получается добавить подписку в Happ.",
    },
    {
      id: "seed_support_message_admin",
      senderId: admin.id,
      authorRole: SupportMessageAuthorRole.ADMIN,
      body: "Проверьте, что ссылка открывается через кнопку Подключить в Happ.",
    },
  ]) {
    await prisma.supportMessage.upsert({
      where: { id: message.id },
      update: {
        conversationId: conversation.id,
        senderId: message.senderId,
        authorRole: message.authorRole,
        body: message.body,
      },
      create: {
        ...message,
        conversationId: conversation.id,
      },
    })
  }

  const nodes = [
    {
      id: "seed_node_de_regular",
      name: "Frankfurt Core",
      country: "Germany",
      city: "Frankfurt",
      type: NodeType.REGULAR,
      protocol: NodeProtocol.VLESS_REALITY,
      domain: "de1.edge.pulsarr.space",
      status: NodeStatus.ACTIVE,
      capacity: 500,
      sortOrder: 10,
    },
    {
      id: "seed_node_nl_lte",
      name: "Amsterdam LTE",
      country: "Netherlands",
      city: "Amsterdam",
      type: NodeType.LTE,
      protocol: NodeProtocol.VLESS_XHTTP_TLS,
      domain: "lte-nl.edge.pulsarr.space",
      status: NodeStatus.ACTIVE,
      capacity: 150,
      sortOrder: 20,
    },
    {
      id: "seed_node_fi_gaming",
      name: "Helsinki Gaming",
      country: "Finland",
      city: "Helsinki",
      type: NodeType.GAMING,
      protocol: NodeProtocol.HYSTERIA,
      domain: "fi-game.edge.pulsarr.space",
      status: NodeStatus.MAINTENANCE,
      capacity: 200,
      sortOrder: 30,
    },
  ]

  for (const node of nodes) {
    await prisma.node.upsert({
      where: { id: node.id },
      update: node,
      create: node,
    })
  }

  const legalDocuments = [
    {
      slug: "terms",
      title: "Пользовательское соглашение",
      content:
        "PulsarVPN предоставляет доступ к VPN-подписке для личного использования. Пользователь обязуется соблюдать применимое законодательство и не использовать сервис для противоправных действий.",
    },
    {
      slug: "privacy",
      title: "Политика конфиденциальности",
      content:
        "Мы храним минимальный набор данных: email или Telegram identity, сведения о платежах, подписках и обращениях в поддержку. Секреты интеграций не публикуются и не отображаются пользователям.",
    },
    {
      slug: "offer",
      title: "Оферта",
      content:
        "Оплата подписки активирует доступ на выбранный срок, лимит устройств и дополнительные опции. LTE является отдельным платным add-on внутри мульти-подписки.",
    },
  ]

  for (const doc of legalDocuments) {
    await prisma.legalDocument.upsert({
      where: { slug: doc.slug },
      update: {
        title: doc.title,
        content: doc.content,
        isPublished: true,
      },
      create: {
        ...doc,
        isPublished: true,
      },
    })
  }

  await prisma.integrationLog.upsert({
    where: { id: "seed_integration_log" },
    update: {
      provider: IntegrationProvider.REMNAWAVE,
      action: "mock.seed.syncSubscription",
      status: IntegrationLogStatus.SUCCESS,
      requestPayload: { subscriptionId: activeSubscription.id },
      responsePayload: { synced: true },
      error: null,
    },
    create: {
      id: "seed_integration_log",
      provider: IntegrationProvider.REMNAWAVE,
      action: "mock.seed.syncSubscription",
      status: IntegrationLogStatus.SUCCESS,
      requestPayload: { subscriptionId: activeSubscription.id },
      responsePayload: { synced: true },
    },
  })

  await prisma.auditLog.upsert({
    where: { id: "seed_audit_log" },
    update: {
      actorUserId: admin.id,
      action: "seed.initialized",
      entityType: "System",
      entityId: "seed",
      metadata: { source: "prisma/seed.ts" },
    },
    create: {
      id: "seed_audit_log",
      actorUserId: admin.id,
      action: "seed.initialized",
      entityType: "System",
      entityId: "seed",
      metadata: { source: "prisma/seed.ts" },
    },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
