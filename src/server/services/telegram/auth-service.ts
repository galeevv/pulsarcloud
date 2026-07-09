import { createRandomToken } from "@/lib/security"

export type TelegramLoginChallenge = {
  nonce: string
  status: "pending"
  message: string
}

export interface TelegramAuthService {
  createLoginChallenge(): Promise<TelegramLoginChallenge>
  verifyLoginChallenge(nonce: string): Promise<null>
}

export class MockTelegramAuthService implements TelegramAuthService {
  async createLoginChallenge() {
    return {
      nonce: createRandomToken(18),
      status: "pending" as const,
      message: "Telegram вход будет подключён позже.",
    }
  }

  async verifyLoginChallenge() {
    return null
  }
}

export function createTelegramAuthService(): TelegramAuthService {
  return new MockTelegramAuthService()
}
