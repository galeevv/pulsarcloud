import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { prisma } from "@/lib/db"

export default async function AdminIntegrationLogsPage() {
  const logs = await prisma.auditEvent.findMany({
    where: { eventType: { startsWith: "integration." } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader><CardTitle>Integration Logs</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Entity</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{log.eventType}</TableCell>
                <TableCell>{log.entityType}</TableCell>
                <TableCell><Badge>recorded</Badge></TableCell>
                <TableCell>{log.createdAt.toLocaleString("ru-RU")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
