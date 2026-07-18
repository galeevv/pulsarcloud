"use client"

import { useRouter } from "next/navigation"

import { TableRow } from "@/components/ui/table"

export function AdminUserTableRow({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <TableRow
      role="link"
      tabIndex={0}
      className="cursor-pointer"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button, input")) return
        router.push(href)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        router.push(href)
      }}
    >
      {children}
    </TableRow>
  )
}
