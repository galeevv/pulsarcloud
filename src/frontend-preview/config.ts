export const isFrontendPreviewEnabled =
  process.env.PULSAR_FRONTEND_PREVIEW === "true" ||
  process.env.NODE_ENV !== "production"

export const backendUnavailableMessage =
  "Действие доступно после подключения нового backend"
