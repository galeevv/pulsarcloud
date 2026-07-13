import Image from "next/image"
import type { ComponentType, ReactNode, SVGProps } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export const pulsarControlClass = "h-11 rounded-[18px]"
export const pulsarCtaClass = cn(pulsarControlClass, "w-full")

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export function PulsarAssetCard({
  alt,
  cardClassName,
  children,
  contentClassName,
  preload,
  sizes = "(max-width: 768px) 100vw, 448px",
  src,
  unoptimized = true,
}: {
  alt: string
  cardClassName?: string
  children: ReactNode
  contentClassName?: string
  preload?: boolean
  sizes?: string
  src: string
  unoptimized?: boolean
}) {
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0",
        cardClassName
      )}
    >
      <div className="relative aspect-[21/9] w-full">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain"
          sizes={sizes}
          unoptimized={unoptimized}
          preload={preload}
        />
      </div>
      <Separator className="my-0" />
      <CardContent className={cn("p-4", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}

export function PulsarIconContainer({
  className,
  icon: Icon,
  iconClassName,
  size = "sm",
}: {
  className?: string
  icon: IconComponent
  iconClassName?: string
  size?: "sm" | "md"
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center border border-border/70 bg-background/40",
        size === "sm" ? "size-9 rounded-xl" : "size-10 rounded-2xl",
        className
      )}
    >
      <Icon className={cn("size-4", iconClassName)} />
    </div>
  )
}

export function PulsarActionRow({
  action,
  className,
  description,
  icon,
  title,
  titleClassName,
  trailing,
}: {
  action?: ReactNode
  className?: string
  description?: ReactNode
  icon: IconComponent
  title: ReactNode
  titleClassName?: string
  trailing?: ReactNode
}) {
  const endSlot = action ?? trailing

  return (
    <div
      className={cn(
        "soft-panel flex min-h-[62px] items-center justify-between gap-3 p-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <PulsarIconContainer icon={icon} />
        <div className="min-w-0">
          <p className={cn("truncate text-sm font-medium", titleClassName)}>
            {title}
          </p>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {endSlot ? <div className="shrink-0">{endSlot}</div> : null}
    </div>
  )
}

export function pulsarLinkButtonClass(className?: string) {
  return cn(buttonVariants({ size: "lg" }), pulsarCtaClass, className)
}
