"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Tabs } from "@/components/ui/tabs"

const operationTabs = ["queue", "sync", "audit", "system"] as const

export type OperationTab = (typeof operationTabs)[number]

export function OperationsTabs({
  activeTab,
  children,
}: {
  activeTab: OperationTab
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  return (
    <Tabs
      value={activeTab}
      className="gap-4"
      onValueChange={(value) => {
        const nextTab = value as OperationTab
        if (!operationTabs.includes(nextTab) || nextTab === activeTab) return
        const params = new URLSearchParams(searchParams.toString())
        if (nextTab === "queue") params.delete("tab")
        else params.set("tab", nextTab)
        const query = params.toString()
        router.push(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        })
      }}
    >
      {children}
    </Tabs>
  )
}
