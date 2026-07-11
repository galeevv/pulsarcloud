import type { AuthProvider } from "@/generated/prisma/client"

type Identity = {
  provider: AuthProvider
  providerSubject: string
}

export function getIdentitySubject(
  identities: readonly Identity[],
  provider: AuthProvider
) {
  return (
    identities.find((identity) => identity.provider === provider)
      ?.providerSubject ?? null
  )
}

export function getUserLabel(identities: readonly Identity[]) {
  return (
    getIdentitySubject(identities, "EMAIL") ??
    getIdentitySubject(identities, "TELEGRAM") ??
    "—"
  )
}
