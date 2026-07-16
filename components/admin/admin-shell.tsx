"use client"

import type { LucideIcon } from "lucide-react"
import {
  ActivityIcon,
  AtomIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  FlaskConicalIcon,
  HeadphonesIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  RadioTowerIcon,
  SendIcon,
  UsersIcon,
  WalletCardsIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

type NavigationItem = {
  label: string
  href: string
  icon: LucideIcon
  activePath?: string
  legacyTab?: string
  subscriptionStatus?: string
  legacyFallback?: boolean
}

const navigation: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Основное",
    items: [
      {
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: LayoutDashboardIcon,
      },
      {
        label: "Пользователи",
        href: "/admin/legacy?tab=users",
        icon: UsersIcon,
        activePath: "/admin/users",
        legacyTab: "users",
      },
      {
        label: "Подписки",
        href: "/admin/legacy?tab=users&subscriptionStatus=ACTIVE",
        icon: RadioTowerIcon,
        legacyTab: "users",
        subscriptionStatus: "ACTIVE",
      },
    ],
  },
  {
    label: "Финансы",
    items: [
      {
        label: "Платежи",
        href: "/admin/legacy?tab=payments",
        icon: CreditCardIcon,
        legacyTab: "payments",
      },
      {
        label: "Выплаты",
        href: "/admin/legacy?tab=payouts",
        icon: WalletCardsIcon,
        legacyTab: "payouts",
      },
    ],
  },
  {
    label: "Коммуникации",
    items: [
      {
        label: "Поддержка",
        href: "/admin/legacy?tab=support",
        icon: HeadphonesIcon,
        legacyTab: "support",
      },
      {
        label: "Telegram",
        href: "/admin/legacy?tab=telegram",
        icon: SendIcon,
        legacyTab: "telegram",
      },
    ],
  },
  {
    label: "Система",
    items: [
      {
        label: "Операции",
        href: "/admin/legacy?tab=jobs",
        icon: ActivityIcon,
        legacyFallback: true,
      },
    ],
  },
]

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/dashboard")) return "Dashboard"
  if (pathname.startsWith("/admin/legacy")) return "Операции"
  if (pathname.startsWith("/admin/users")) return "Пользователи"
  if (pathname.startsWith("/admin/test")) return "Test mode"
  return "Pulsar Admin"
}

function isNavigationItemActive(
  pathname: string,
  searchParams: { get(name: string): string | null },
  item: NavigationItem
) {
  if (item.activePath && pathname.startsWith(item.activePath)) return true
  if (pathname === "/admin/legacy") {
    const activeTab = searchParams.get("tab") ?? "users"
    if (item.legacyFallback) {
      return !["users", "payments", "payouts", "support", "telegram"].includes(
        activeTab
      )
    }
    if (item.legacyTab !== activeTab) return false
    if (item.subscriptionStatus) {
      return searchParams.get("subscriptionStatus") === item.subscriptionStatus
    }
    return item.legacyTab === "users"
      ? searchParams.get("subscriptionStatus") !== "ACTIVE"
      : true
  }
  return pathname === item.href
}

function AdminSidebarLink({
  onClick,
  ...props
}: React.ComponentProps<typeof Link>) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented && isMobile) {
          window.setTimeout(() => setOpenMobile(false), 0)
        }
      }}
    />
  )
}

function formatTelegramUsername(username?: string) {
  if (!username) return "Telegram не привязан"
  return username.startsWith("@") ? username : `@${username}`
}

function AdminAccountMenu({
  adminTelegramUsername,
}: {
  adminTelegramUsername?: string
}) {
  const [pending, setPending] = useState(false)
  const { isMobile } = useSidebar()
  const telegramUsername = formatTelegramUsername(adminTelegramUsername)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            size="lg"
            className="rounded-[18px] border border-sidebar-border aria-expanded:bg-sidebar-accent group-data-[collapsible=icon]:size-10!"
            tooltip="Меню администратора"
            aria-label="Открыть меню администратора"
          />
        }
      >
        <Avatar className="size-9">
          <AvatarFallback className="bg-background text-foreground [&_svg]:size-4">
            <AtomIcon />
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-sm font-medium">Pulsar</span>
          <span className="truncate text-xs text-sidebar-foreground/60">
            {telegramUsername}
          </span>
        </span>
        <ChevronsUpDownIcon className="ml-auto" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
        className="min-w-56"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="grid gap-0.5">
            <span className="font-medium text-foreground">Pulsar</span>
            <span className="truncate font-normal">{telegramUsername}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                const response = await fetch("/api/auth/logout", {
                  method: "POST",
                })
                if (!response.ok) throw new Error("Logout failed")
                window.location.assign("/")
              } catch {
                setPending(false)
                toast.error("Не удалось выйти. Попробуйте ещё раз.")
              }
            }}
          >
            <LogOutIcon />
            {pending ? "Выходим…" : "Выйти"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AdminHeader({ testMode }: { testMode: boolean }) {
  const pathname = usePathname()

  return (
    <header className="sticky top-4 z-40 shrink-0">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <div className="rounded-3xl border border-border/70 bg-background/70 px-3 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger
                className="rounded-2xl border border-border/70"
                aria-label="Открыть навигацию"
              />
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                {pageTitle(pathname)}
              </h1>
            </div>
            {testMode ? <Badge variant="outline">TEST MODE</Badge> : null}
          </div>
        </div>
      </div>
    </header>
  )
}

export function AdminShell({
  children,
  adminTelegramUsername,
  testMode,
}: {
  children: React.ReactNode
  adminTelegramUsername?: string
  testMode: boolean
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarContent className="gap-0 py-2">
          {navigation.map((group) => (
            <SidebarGroup key={group.label} className="px-2 py-1">
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          className="rounded-lg"
                          tooltip={item.label}
                          isActive={isNavigationItemActive(
                            pathname,
                            searchParams,
                            item
                          )}
                          render={<AdminSidebarLink href={item.href} />}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {testMode ? (
            <SidebarGroup className="px-2 py-1">
              <SidebarGroupLabel>Разработка</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="rounded-lg"
                      tooltip="Test mode"
                      isActive={pathname.startsWith("/admin/test")}
                      render={<AdminSidebarLink href="/admin/test" />}
                    >
                      <FlaskConicalIcon />
                      <span>Test mode</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <AdminAccountMenu
                adminTelegramUsername={adminTelegramUsername}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-background">
        <AdminHeader testMode={testMode} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
