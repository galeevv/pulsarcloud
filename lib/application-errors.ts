export type ApplicationErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INTEGRATION"

export abstract class ApplicationError extends Error {
  abstract readonly code: ApplicationErrorCode

  constructor(
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

export class ValidationError extends ApplicationError {
  readonly code = "VALIDATION" as const
}

export class UnauthorizedError extends ApplicationError {
  readonly code = "UNAUTHORIZED" as const
}

export class ForbiddenError extends ApplicationError {
  readonly code = "FORBIDDEN" as const
}

export class ConflictError extends ApplicationError {
  readonly code = "CONFLICT" as const
}

export class NotFoundError extends ApplicationError {
  readonly code = "NOT_FOUND" as const
}

export class IntegrationError extends ApplicationError {
  readonly code = "INTEGRATION" as const
}
