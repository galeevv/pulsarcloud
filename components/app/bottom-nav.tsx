"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { GiftIcon, HomeIcon, RadioIcon, UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const navItems = [
  {
    href: "/home",
    label: "Главная",
    icon: HomeIcon,
    asset: "/hero/pulsar.gif",
  },
  {
    href: "/subscription",
    label: "Подписка",
    icon: RadioIcon,
    asset: "/details/observed.gif",
  },
  {
    href: "/referrals",
    label: "Рефералы",
    icon: GiftIcon,
    asset: "/details/physics.gif",
  },
  {
    href: "/profile",
    label: "Профиль",
    icon: UserIcon,
    asset: "/details/birth.gif",
  },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const warmedAssets = React.useRef(new Set<string>())

  React.useEffect(() => {
    const warmRoutes = () => {
      for (const item of navItems) {
        router.prefetch(item.href)
      }
    }

    const idleApi = window as unknown as {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (idleApi.requestIdleCallback) {
      const id = idleApi.requestIdleCallback(warmRoutes, {
        timeout: 2500,
      })
      return () => idleApi.cancelIdleCallback?.(id)
    }

    const id = window.setTimeout(warmRoutes, 1200)
    return () => window.clearTimeout(id)
  }, [router])

  function warmAsset(src: string) {
    if (warmedAssets.current.has(src)) return
    warmedAssets.current.add(src)
    const image = new window.Image()
    image.src = src
  }

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
              prefetch
              onFocus={() => warmAsset(item.asset)}
              onPointerDown={() => warmAsset(item.asset)}
              onPointerEnter={() => warmAsset(item.asset)}
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
