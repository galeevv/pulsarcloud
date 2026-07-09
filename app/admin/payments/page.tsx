import { confirmPaymentAction } from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

export default async function AdminPaymentsPage() {
  const payments = await prisma.payment.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
  })

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
              <TableHead>Plan</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>{payment.user.email}</TableCell>
                <TableCell>{formatRub(payment.amountRub)}</TableCell>
                <TableCell><Badge>{payment.status}</Badge></TableCell>
                <TableCell>{payment.durationMonths} mo · {payment.deviceLimit} dev · LTE {payment.lteEnabled ? "yes" : "no"}</TableCell>
                <TableCell>{payment.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                <TableCell>
                  {payment.status === "PENDING" ? (
                    <form action={confirmPaymentAction}>
                      <input type="hidden" name="paymentId" value={payment.id} />
                      <Button type="submit" size="sm">Confirm payment</Button>
                    </form>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
