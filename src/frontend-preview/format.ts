export function formatPreviewRub(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function getPreviewUserLabel(
  identities: Array<{ provider: string; providerSubject: string }>
) {
  return (
    identities.find((identity) => identity.provider === "EMAIL")
      ?.providerSubject ??
    identities.find((identity) => identity.provider === "TELEGRAM")
      ?.providerSubject ??
    "Pulsar user"
  )
}
