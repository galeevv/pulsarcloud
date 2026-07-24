import type {
  Prisma,
  SupportWorkflowState,
} from "@/src/generated/prisma/client"

import { getConfig } from "@/src/server/config"
import { db } from "@/src/server/infrastructure/db/client"
import { requireWebSession } from "@/src/server/transport/web/session"

export const SUPPORT_FILTERS = ["all", "new", "waiting", "closed"] as const

export type SupportFilter = (typeof SUPPORT_FILTERS)[number]

const PAGE_SIZE = 25

const FILTER_STATE: Partial<Record<SupportFilter, SupportWorkflowState>> = {
  new: "NEW",
  waiting: "WAITING",
  closed: "CLOSED",
}

export function parseSupportFilter(value: string | undefined): SupportFilter {
  return SUPPORT_FILTERS.includes(value as SupportFilter)
    ? (value as SupportFilter)
    : "all"
}

export function supportUserLabel(user: {
  identities: Array<{
    emailNormalized: string | null
    telegramUsername: string | null
  }>
  telegramProfile: { username: string | null } | null
}) {
  const telegram =
    user.telegramProfile?.username ??
    user.identities.find((identity) => identity.telegramUsername)
      ?.telegramUsername
  if (telegram) return telegram.startsWith("@") ? telegram : `@${telegram}`
  return (
    user.identities.find((identity) => identity.emailNormalized)
      ?.emailNormalized ?? "Пользователь Pulsar"
  )
}

export function supportEmail(user: {
  identities: Array<{ emailNormalized: string | null }>
}) {
  return (
    user.identities.find((identity) => identity.emailNormalized)
      ?.emailNormalized ?? null
  )
}

function classification(state: SupportWorkflowState) {
  return state.toLowerCase() as "new" | "waiting" | "answered" | "closed"
}

export async function getAdminSupportView(input: {
  query: string
  filter: SupportFilter
  page: number
}) {
  await requireWebSession("ADMIN")
  const query = input.query.trim().slice(0, 100)
  const telegramQuery = query.replace(/^@/, "")
  const environmentWhere: Prisma.SupportConversationWhereInput = {
    user: { is: { role: "USER", isTest: getConfig().testMode } },
  }
  const searchWhere: Prisma.SupportConversationWhereInput = query
    ? {
        user: {
          is: {
            OR: [
              {
                identities: {
                  some: {
                    OR: [
                      {
                        emailNormalized: {
                          contains: query.toLowerCase(),
                        },
                      },
                      {
                        telegramUsername: {
                          contains: telegramQuery,
                        },
                      },
                    ],
                  },
                },
              },
              {
                telegramProfile: {
                  is: { username: { contains: telegramQuery } },
                },
              },
            ],
          },
        },
      }
    : {}
  const selectedState = FILTER_STATE[input.filter]
  const where: Prisma.SupportConversationWhereInput = {
    AND: [
      environmentWhere,
      searchWhere,
      ...(selectedState ? [{ workflowState: selectedState }] : []),
    ],
  }

  const total = await db.supportConversation.count({ where })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(Math.max(1, input.page), totalPages)
  const conversations = await db.supportConversation.findMany({
    where,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      topic: true,
      channel: true,
      workflowState: true,
      lastMessageAt: true,
      user: {
        select: {
          identities: {
            select: {
              emailNormalized: true,
              telegramUsername: true,
            },
          },
          telegramProfile: { select: { username: true } },
        },
      },
      messages: {
        where: { isInternal: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          body: true,
          authorRole: true,
          source: true,
          createdAt: true,
        },
      },
    },
  })

  return {
    conversations: conversations.map((conversation) => ({
      ...conversation,
      classification: classification(conversation.workflowState),
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
  }
}

export async function getAdminSupportConversation(id: string) {
  await requireWebSession("ADMIN")
  const conversation = await db.supportConversation.findFirst({
    where: {
      id,
      user: { is: { role: "USER", isTest: getConfig().testMode } },
    },
    include: {
      user: {
        include: {
          identities: true,
          telegramProfile: true,
          subscription: true,
          wallet: true,
          referralProfile: true,
          _count: { select: { sentInvites: true } },
        },
      },
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 500,
      },
    },
  })
  if (!conversation) return null
  return {
    ...conversation,
    messages: [...conversation.messages].reverse(),
  }
}
