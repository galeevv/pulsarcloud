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
import { formatRub } from "@/lib/pricing"
import { getUserLabel } from "@/lib/user-identity"

export default async function AdminWalletPage() {
  const entries = await prisma.walletLedgerEntry.findMany({
    include: { user: { include: { authIdentities: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader>
        <CardTitle>Wallet / Balance Ledger</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{getUserLabel(entry.user.authIdentities)}</TableCell>
                <TableCell>{entry.direction}</TableCell>
                <TableCell>{formatRub(entry.amountRub)}</TableCell>
                <TableCell><Badge variant="secondary">{entry.type}</Badge></TableCell>
                <TableCell>{entry.status}</TableCell>
                <TableCell>{entry.createdAt.toLocaleString("ru-RU")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
