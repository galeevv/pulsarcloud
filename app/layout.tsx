import type { Metadata } from "next"

import "./globals.css"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "PULSAR",
  description: "Личный кабинет PulsarVPN",
  icons: {
    icon: "/logo/Logo1.svg?v=2",
    shortcut: "/logo/Logo1.svg?v=2",
    apple: "/logo/Logo1.svg?v=2",
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
