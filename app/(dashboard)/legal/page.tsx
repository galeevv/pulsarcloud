import { promises as fs } from "node:fs"
import path from "node:path"
import type { Metadata } from "next"
import { FileTextIcon } from "lucide-react"

import { PulsarIconContainer } from "@/components/app/pulsar-primitives"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata: Metadata = {
  title: "Юридическая информация",
}

const legalDocuments = [
  {
    file: "agreement.md",
    label: "Соглашение",
    slug: "agreement",
    title: "Пользовательское соглашение",
  },
  {
    file: "offer.md",
    label: "Оферта",
    slug: "offer",
    title: "Публичная оферта",
  },
  {
    file: "confidentiality.md",
    label: "Политика",
    slug: "confidentiality",
    title: "Политика конфиденциальности",
  },
]

export default async function LegalPage() {
  const documents = await Promise.all(
    legalDocuments.map(async (document) => ({
      ...document,
      content: await fs.readFile(
        path.join(process.cwd(), "docs", document.file),
        "utf8"
      ),
    }))
  )
  const defaultDocument = documents[0]

  return (
    <main className="pulsar-container">
      <Card className="h-[min(720px,calc(100svh-7.5rem))] min-h-[520px] gap-0 overflow-hidden rounded-3xl border border-border/70 bg-card/40 py-0 sm:h-[720px]">
        <CardContent className="flex size-full min-h-0 flex-col p-0">
          <div className="flex min-h-[56px] items-center gap-3 border-b border-border/70 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <PulsarIconContainer icon={FileTextIcon} />
              <h1 className="truncate text-sm leading-5 font-medium">
                Юридическая информация
              </h1>
            </div>
          </div>

          <Tabs
            defaultValue={defaultDocument.slug}
            className="min-h-0 w-full flex-1 gap-3 p-4"
          >
            <TabsList className="w-full">
              {documents.map((document) => (
                <TabsTrigger
                  key={document.slug}
                  value={document.slug}
                  className="min-w-0"
                >
                  <span className="truncate">{document.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {documents.map((document) => (
              <TabsContent
                key={document.slug}
                value={document.slug}
                className="min-h-0"
              >
                <div className="soft-panel flex size-full min-h-0 flex-col gap-3 p-4">
                  <p className="font-semibold">{document.title}</p>
                  <Separator className="my-0" />
                  <ScrollArea className="min-h-0 flex-1">
                    <p className="pr-3 text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
                      {document.content}
                    </p>
                  </ScrollArea>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
