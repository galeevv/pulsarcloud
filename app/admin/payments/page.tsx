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
import { previewAdminPayments } from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminPaymentsPage() {
  const payments = previewAdminPayments

  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader>
        <CardTitle>Payments</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  {getPreviewUserLabel(payment.user.authIdentities)}
                </TableCell>
                <TableCell>{formatPreviewRub(payment.amountRub)}</TableCell>
                <TableCell>
                  <Badge>{payment.status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{payment.provider}</Badge>
                </TableCell>
                <TableCell>
                  {payment.durationMonths} mo · {payment.deviceLimit} dev · LTE{" "}
                  {payment.lteEnabled ? "yes" : "no"}
                </TableCell>
                <TableCell>
                  {payment.createdAt.toLocaleDateString("ru-RU")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
