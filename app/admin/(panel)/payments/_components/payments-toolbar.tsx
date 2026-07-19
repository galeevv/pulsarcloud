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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import type { PaymentFilter, PaymentPeriod, PaymentSort } from "../_lib/filters"

const filters: Array<{ label: string; value: PaymentFilter }> = [
  { label: "Все", value: "all" },
  { label: "Успешные", value: "successful" },
  { label: "Ожидают", value: "pending" },
  { label: "Ошибка", value: "failed" },
  { label: "Возврат", value: "refunded" },
]

const periods: Array<{ label: string; value: PaymentPeriod }> = [
  { label: "7 дней", value: "7d" },
  { label: "30 дней", value: "30d" },
  { label: "90 дней", value: "90d" },
  { label: "Всё время", value: "all" },
]

const sorts: Array<{ label: string; value: PaymentSort }> = [
  { label: "Сначала новые", value: "newest" },
  { label: "Сначала старые", value: "oldest" },
  { label: "Сумма по убыванию", value: "amount-desc" },
  { label: "Сумма по возрастанию", value: "amount-asc" },
]

export function PaymentsToolbar({
  query,
  filter,
  period,
  sort,
}: {
  query: string
  filter: PaymentFilter
  period: PaymentPeriod
  sort: PaymentSort
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [search, setSearch] = useState(query)
  const [pending, startTransition] = useTransition()

  const navigate = useCallback(
    (next: {
      query: string
      filter: PaymentFilter
      period: PaymentPeriod
      sort: PaymentSort
    }) => {
      const params = new URLSearchParams()
      const normalizedQuery = next.query.trim()
      if (normalizedQuery) params.set("q", normalizedQuery)
      if (next.filter !== "all") params.set("status", next.filter)
      if (next.period !== "30d") params.set("period", next.period)
      if (next.sort !== "newest") params.set("sort", next.sort)
      const suffix = params.size ? `?${params.toString()}` : ""
      startTransition(() => router.push(`${pathname}${suffix}`))
    },
    [pathname, router]
  )

  useEffect(() => {
    if (search.trim() === query) return
    const timeout = window.setTimeout(
      () => navigate({ query: search, filter, period, sort }),
      350
    )
    return () => window.clearTimeout(timeout)
  }, [filter, navigate, period, query, search, sort])

  const isFiltered =
    query || filter !== "all" || period !== "30d" || sort !== "newest"

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="admin-payment-search" className="sr-only">
            Поиск платежей
          </FieldLabel>
          <div className="flex gap-2">
            <InputGroup className="h-10 flex-1" data-disabled={pending}>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id="admin-payment-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Telegram username, email или ID платежа"
                autoComplete="off"
                maxLength={100}
              />
            </InputGroup>
            {isFiltered ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setSearch("")
                  navigate({
                    query: "",
                    filter: "all",
                    period: "30d",
                    sort: "newest",
                  })
                }}
              >
                <XIcon data-icon="inline-start" />
                Сбросить
              </Button>
            ) : null}
          </div>
        </Field>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <Field>
            <FieldLabel id="admin-payment-filter-label" className="sr-only">
              Фильтр статуса платежей
            </FieldLabel>
            <ToggleGroup
              aria-labelledby="admin-payment-filter-label"
              value={[filter]}
              onValueChange={(values) => {
                const nextFilter = values[0] as PaymentFilter | undefined
                if (nextFilter)
                  navigate({
                    query: search,
                    filter: nextFilter,
                    period,
                    sort,
                  })
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

          <div className="flex gap-2">
            <Field>
              <FieldLabel htmlFor="admin-payment-period" className="sr-only">
                Период
              </FieldLabel>
              <Select
                items={periods}
                value={period}
                onValueChange={(value) => {
                  if (!value) return
                  navigate({
                    query: search,
                    filter,
                    period: value as PaymentPeriod,
                    sort,
                  })
                }}
                disabled={pending}
              >
                <SelectTrigger id="admin-payment-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {periods.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="admin-payment-sort" className="sr-only">
                Сортировка
              </FieldLabel>
              <Select
                items={sorts}
                value={sort}
                onValueChange={(value) => {
                  if (!value) return
                  navigate({
                    query: search,
                    filter,
                    period,
                    sort: value as PaymentSort,
                  })
                }}
                disabled={pending}
              >
                <SelectTrigger id="admin-payment-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {sorts.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      </FieldGroup>
    </form>
  )
}
