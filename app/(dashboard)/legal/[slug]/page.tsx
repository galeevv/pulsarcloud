import { notFound } from "next/navigation"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { prisma } from "@/lib/db"

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const document = await prisma.legalDocument.findUnique({
    where: { slug },
  })

  if (!document?.isPublished) {
    notFound()
  }

  return (
    <main className="pulsar-container">
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>{document.title}</CardTitle>
          <CardDescription>
            Редактируемый legal content из базы данных.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
            {document.content}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
