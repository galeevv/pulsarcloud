import {
  approvePayoutAction,
  markPayoutPaidAction,
  rejectPayoutAction,
} from "@/app/admin/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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

export default async function AdminPayoutsPage() {
  const payouts = await prisma.payoutRequest.findMany({
    include: { user: { include: { authIdentities: true } } },
    orderBy: { createdAt: "desc" },
  })

  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader><CardTitle>Payout Requests</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead><TableHead>Amount</TableHead><TableHead>Details</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((payout) => (
              <TableRow key={payout.id}>
                <TableCell>{getUserLabel(payout.user.authIdentities)}</TableCell>
                <TableCell>{formatRub(payout.amountRub)}</TableCell>
                <TableCell>{payout.payoutDetails}</TableCell>
                <TableCell><Badge>{payout.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex min-w-96 flex-col gap-2">
                    <PayoutAction action={approvePayoutAction} payoutId={payout.id} label="Approve" />
                    <PayoutAction action={markPayoutPaidAction} payoutId={payout.id} label="Mark paid" />
                    <PayoutAction action={rejectPayoutAction} payoutId={payout.id} label="Reject" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function PayoutAction({
  action,
  payoutId,
  label,
}: {
  action: (formData: FormData) => Promise<void>
  payoutId: string
  label: string
}) {
  return (
    <form action={action} className="flex gap-2">
      <input type="hidden" name="payoutId" value={payoutId} />
      <Input name="adminNote" placeholder="Admin note" />
      <Button type="submit" size="sm" variant="outline">{label}</Button>
    </form>
  )
}
