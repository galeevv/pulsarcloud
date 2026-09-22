"use client"

import * as React from "react"
import { toast } from "sonner"

import { assignUserReferral } from "@/app/admin/actions"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Input,
} from "@/components/ui/input"

type ReferralOwner = { id: string; label: string; searchText?: string }

export function ReferralAssignmentForm({
  invitedUserId,
  owners,
}: {
  invitedUserId: string
  owners: ReferralOwner[]
}) {
  const [ownerId, setOwnerId] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const filteredOwners = owners
    .filter((owner) =>
      (owner.searchText ?? owner.label)
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase().trim())
    )
    .slice(0, 50)
  const selectedOwner = owners.find((owner) => owner.id === ownerId)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ownerId) {
      toast.error("Выберите владельца рефералки.")
      return
    }
    setPending(true)
    try {
      const data = new FormData()
      data.set("invitedUserId", invitedUserId)
      data.set("inviterUserId", ownerId)
      await assignUserReferral(data)
      toast.success("Пользователь привязан к владельцу рефералки.")
    } catch {
      toast.error("Не удалось привязать пользователя. Возможно, связь уже существует.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="referral-owner-search">Владелец рефералки</FieldLabel>
          <Input
            id="referral-owner-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по email или Telegram"
            disabled={pending || !owners.length}
          />
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-2xl border border-border/70 p-1">
            {filteredOwners.length ? (
              filteredOwners.map((owner) => (
                <Button
                  key={owner.id}
                  type="button"
                  variant={owner.id === ownerId ? "secondary" : "ghost"}
                  className="justify-start"
                  onClick={() => setOwnerId(owner.id)}
                  disabled={pending}
                >
                  {owner.label}
                </Button>
              ))
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Пользователи не найдены.
              </p>
            )}
          </div>
          {selectedOwner ? (
            <FieldDescription>Выбран: {selectedOwner.label}</FieldDescription>
          ) : null}
          <FieldDescription>
            Связь создаётся без повторного пробного периода.
          </FieldDescription>
        </Field>
        <Button type="submit" variant="outline" disabled={pending || !owners.length}>
          {pending ? "Привязываем…" : "Привязать пользователя"}
        </Button>
      </FieldGroup>
    </form>
  )
}
