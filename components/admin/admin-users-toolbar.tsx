"use client"

import { SearchIcon, XIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"

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

  const navigate = useCallback(
    (nextFilter: AdminUserFilter, nextQuery: string) => {
      const params = new URLSearchParams()
      const normalizedQuery = nextQuery.trim()
      if (normalizedQuery) params.set("q", normalizedQuery)
      if (nextFilter !== "all") params.set("status", nextFilter)
      const suffix = params.size ? `?${params.toString()}` : ""
      startTransition(() => router.push(`${pathname}${suffix}`))
    },
    [pathname, router]
  )

  useEffect(() => {
    if (search.trim() === query) return
    const timeout = window.setTimeout(() => navigate(filter, search), 350)
    return () => window.clearTimeout(timeout)
  }, [filter, navigate, query, search])

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="admin-user-search" className="sr-only">
            Поиск пользователей
          </FieldLabel>
          <div className="flex gap-2">
            <InputGroup className="h-10 flex-1" data-disabled={pending}>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id="admin-user-search"
                name="q"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Telegram username или email"
                autoComplete="off"
                maxLength={100}
              />
            </InputGroup>
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
              if (nextFilter) navigate(nextFilter, search)
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
