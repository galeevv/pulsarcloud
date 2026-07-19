"use client"

import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import type { SupportFilter } from "./_lib/query"

const filters: Array<{ label: string; value: SupportFilter }> = [
  { label: "Все", value: "all" },
  { label: "Новые", value: "new" },
  { label: "Ожидают", value: "waiting" },
  { label: "Закрытые", value: "closed" },
]

export function SupportToolbar({
  query,
  filter,
}: {
  query: string
  filter: SupportFilter
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [search, setSearch] = React.useState(query)
  const [pending, startTransition] = React.useTransition()

  const navigate = React.useCallback(
    (nextFilter: SupportFilter, nextQuery: string) => {
      const params = new URLSearchParams()
      const normalizedQuery = nextQuery.trim()
      if (normalizedQuery) params.set("q", normalizedQuery)
      if (nextFilter !== "all") params.set("status", nextFilter)
      startTransition(() =>
        router.push(params.size ? `${pathname}?${params.toString()}` : pathname)
      )
    },
    [pathname, router]
  )

  React.useEffect(() => {
    if (search.trim() === query) return
    const timeout = window.setTimeout(() => navigate(filter, search), 350)
    return () => window.clearTimeout(timeout)
  }, [filter, navigate, query, search])

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="admin-support-search" className="sr-only">
            Поиск обращений
          </FieldLabel>
          <div className="flex gap-2">
            <InputGroup className="h-10 flex-1" data-disabled={pending}>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id="admin-support-search"
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
          <FieldLabel id="admin-support-filter-label" className="sr-only">
            Статус обращения
          </FieldLabel>
          <ToggleGroup
            aria-labelledby="admin-support-filter-label"
            value={[filter]}
            onValueChange={(values) => {
              const next = values[0] as SupportFilter | undefined
              if (next) navigate(next, search)
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
