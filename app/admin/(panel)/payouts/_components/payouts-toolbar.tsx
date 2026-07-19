"use client"

import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"

import { Field, FieldLabel } from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import type { PayoutFilter } from "../_lib/filters"

const filters: Array<{ label: string; value: PayoutFilter }> = [
  { label: "Ожидают", value: "pending" },
  { label: "Одобрены", value: "approved" },
  { label: "Выплачены", value: "paid" },
  { label: "Отклонены", value: "rejected" },
]

export function PayoutsToolbar({ filter }: { filter: PayoutFilter }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Field>
      <FieldLabel id="admin-payout-filter-label" className="sr-only">
        Фильтр заявок на выплату
      </FieldLabel>
      <ToggleGroup
        aria-labelledby="admin-payout-filter-label"
        value={[filter]}
        onValueChange={(values) => {
          const nextFilter = values[0] as PayoutFilter | undefined
          if (!nextFilter) return
          const suffix = nextFilter === "pending" ? "" : `?status=${nextFilter}`
          startTransition(() => router.push(`${pathname}${suffix}`))
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
  )
}
