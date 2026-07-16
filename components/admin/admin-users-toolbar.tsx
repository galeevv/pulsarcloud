"use client"

import { SearchIcon, XIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AdminUserFilter } from "@/src/server/queries/admin-users"

const filters: Array<{ label: string; value: AdminUserFilter }> = [
  { label: "Все", value: "all" },
  { label: "Active", value: "active" },
  { label: "Trial", value: "trial" },
  { label: "Expired", value: "expired" },
  { label: "Sync failed", value: "sync-failed" },
  { label: "None", value: "none" },
]

export function AdminUsersToolbar({
  query,
  filter,
}: {
  query: string
  filter: AdminUserFilter
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [search, setSearch] = useState(query)
  const [pending, startTransition] = useTransition()

  function navigate(nextFilter: AdminUserFilter, nextQuery = search) {
    const params = new URLSearchParams()
    const normalizedQuery = nextQuery.trim()
    if (normalizedQuery) params.set("q", normalizedQuery)
    if (nextFilter !== "all") params.set("status", nextFilter)
    const suffix = params.size ? `?${params.toString()}` : ""
    startTransition(() => router.push(`${pathname}${suffix}`))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        navigate(filter)
      }}
    >
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="admin-user-search" className="sr-only">
            Поиск пользователей
          </FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <InputGroup className="h-10 flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id="admin-user-search"
                name="q"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Telegram username, email или внутренний ID"
                autoComplete="off"
                maxLength={100}
              />
            </InputGroup>
            <Button type="submit" disabled={pending}>
              Найти
            </Button>
            {query || filter !== "all" ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setSearch("")
                  navigate("all", "")
                }}
              >
                <XIcon data-icon="inline-start" />
                Сбросить
              </Button>
            ) : null}
          </div>
        </Field>

        <Field>
          <FieldLabel id="admin-user-filter-label" className="sr-only">
            Фильтр подписки
          </FieldLabel>
          <ToggleGroup
            aria-labelledby="admin-user-filter-label"
            value={[filter]}
            onValueChange={(values) => {
              const nextFilter = values[0] as AdminUserFilter | undefined
              if (nextFilter) navigate(nextFilter)
            }}
            variant="outline"
            size="sm"
            spacing={1}
            className="w-full flex-wrap justify-start"
          >
            {filters.map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                disabled={pending}
              >
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FieldGroup>
    </form>
  )
}
