"use client"

import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import {
  PulsarAssetCard,
  pulsarCtaClass,
} from "@/components/app/pulsar-primitives"
import { Button } from "@/components/ui/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { Separator } from "@/components/ui/separator"
import { backendUnavailableMessage } from "@/src/frontend-preview/config"

export function AuthCard({
  authError,
  invite,
}: {
  authError?: "expired" | "used"
  invite?: string
}) {
  const [email, setEmail] = React.useState("")
  const [isLinkSent, setIsLinkSent] = React.useState(false)
  const [otp, setOtp] = React.useState("")
  const authErrorMessage =
    authError === "used"
      ? "Ссылка уже использована. Запросите новую ссылку для входа."
      : authError === "expired"
        ? "Ссылка устарела. Запросите новую ссылку для входа."
        : null

  function showUnavailable() {
    toast.info(backendUnavailableMessage)
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <PulsarAssetCard
        src="/hero/pulsar.gif"
        alt="PulsarVPN"
        cardClassName="w-full max-w-md"
        contentClassName="relative flex min-h-56 flex-col justify-center gap-4"
      >
        {isLinkSent ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="absolute top-4 left-4"
            aria-label="Изменить email"
            onClick={() => {
              setIsLinkSent(false)
              setOtp("")
            }}
          >
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <CardHeader className="items-center gap-1.5 p-0 text-center">
          <CardTitle>
            {isLinkSent ? "Введите код" : "Добро пожаловать"}
          </CardTitle>
          <CardDescription>
            {isLinkSent
              ? `Код отправлен на ${email}`
              : "Подключиться к pulsar с помощью"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-0">
          {isLinkSent ? (
            <div className="flex flex-col gap-4">
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  showUnavailable()
                }}
              >
                <input type="hidden" name="email" value={email} />
                <input type="hidden" name="invite" value={invite ?? ""} />
                <FieldGroup>
                  <Field>
                    <FieldLabel className="sr-only">Код из письма</FieldLabel>
                    <InputOTP
                      name="otp"
                      value={otp}
                      onChange={(value) =>
                        setOtp(value.replace(/\D/g, "").slice(0, 6))
                      }
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      containerClassName="justify-center"
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={otp.length !== 6}>
                  Продолжить
                </Button>
              </form>
              <Button
                type="button"
                size="sm"
                variant="link"
                className="h-auto px-0 text-sm"
                onClick={showUnavailable}
              >
                Отправить новую ссылку
              </Button>
            </div>
          ) : (
            <>
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!email) return
                  setIsLinkSent(true)
                  showUnavailable()
                }}
              >
                <input type="hidden" name="invite" value={invite ?? ""} />
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email" className="sr-only">
                      Email
                    </FieldLabel>
                    <InputGroup className="h-11 rounded-[18px] bg-input/50">
                      <InputGroupInput
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="Email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />
                      <InputGroupAddon align="inline-end" className="pr-1.5">
                        <InputGroupButton
                          type="submit"
                          size="icon-sm"
                          variant="default"
                          aria-label="Продолжить"
                        >
                          <ArrowRightIcon />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </FieldGroup>
                {authErrorMessage ? (
                  <p className="text-sm text-destructive">{authErrorMessage}</p>
                ) : null}
              </form>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">или</span>
                <Separator className="flex-1" />
              </div>

              <Button
                type="button"
                variant="outline"
                className={pulsarCtaClass}
                onClick={showUnavailable}
              >
                <SendIcon data-icon="inline-start" />С помощью Telegram
              </Button>
            </>
          )}
        </CardContent>
      </PulsarAssetCard>
    </main>
  )
}
