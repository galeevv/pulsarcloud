"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GiftIcon, HomeIcon, RadioIcon, UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const navItems = [
  { href: "/home", label: "Главная", icon: HomeIcon },
  { href: "/subscription", label: "Подписка", icon: RadioIcon },
  { href: "/referrals", label: "Рефералы", icon: GiftIcon },
  { href: "/profile", label: "Профиль", icon: UserIcon },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 mx-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-border/70 bg-card/40 p-1.5 backdrop-blur-xl">
      <div className="grid grid-cols-4 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex h-12 items-center justify-center rounded-[var(--pulsar-nav-item-radius)] text-muted-foreground",
                active && "bg-primary text-primary-foreground"
              )}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "transition-colors",
                  !active && "group-hover:text-foreground"
                )}
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
