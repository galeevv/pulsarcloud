import type { Metadata } from "next"

import "./globals.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "PULSAR",
  description: "Личный кабинет PulsarVPN",
  icons: {
    icon: "/logo/logo-no-bg-preview (carve.photos).png",
    shortcut: "/logo/logo-no-bg-preview (carve.photos).png",
    apple: "/logo/logo-no-bg-preview (carve.photos).png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className="dark font-sans antialiased"
    >
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
