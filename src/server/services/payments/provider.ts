export type CreatePaymentInput = {
  paymentId: string
  amountRub: number
  description: string
}

export type CreatedPayment = {
  providerPaymentId: string
  checkoutUrl: string
}

export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatedPayment>
  getPaymentStatus(providerPaymentId: string): Promise<"pending" | "confirmed">
}

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(input: CreatePaymentInput) {
    return {
      providerPaymentId: `mock-${input.paymentId}`,
      checkoutUrl: `mock://payment/${input.paymentId}`,
    }
  }

  async getPaymentStatus() {
    return "pending" as const
  }
}

export function createPaymentProvider(): PaymentProvider {
  return new MockPaymentProvider()
}
