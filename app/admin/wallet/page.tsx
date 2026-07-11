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
import {
  formatPreviewRub,
  getPreviewUserLabel,
} from "@/src/frontend-preview/format"
import { previewAdminWalletEntries } from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminWalletPage() {
  const entries = previewAdminWalletEntries

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
                <TableCell>
                  {getPreviewUserLabel(entry.user.authIdentities)}
                </TableCell>
                <TableCell>{entry.direction}</TableCell>
                <TableCell>{formatPreviewRub(entry.amountRub)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{entry.type}</Badge>
                </TableCell>
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
