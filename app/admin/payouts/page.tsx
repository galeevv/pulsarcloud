import { PreviewForm } from "@/components/frontend-preview/preview-form"
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
import {
  formatPreviewRub,
  getPreviewUserLabel,
} from "@/src/frontend-preview/format"
import { previewAdminPayouts } from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminPayoutsPage() {
  const payouts = previewAdminPayouts

  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader>
        <CardTitle>Payout Requests</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((payout) => (
              <TableRow key={payout.id}>
                <TableCell>
                  {getPreviewUserLabel(payout.user.authIdentities)}
                </TableCell>
                <TableCell>{formatPreviewRub(payout.amountRub)}</TableCell>
                <TableCell>{payout.payoutDetails}</TableCell>
                <TableCell>
                  <Badge>{payout.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-96 flex-col gap-2">
                    <PayoutAction payoutId={payout.id} label="Approve" />
                    <PayoutAction payoutId={payout.id} label="Mark paid" />
                    <PayoutAction payoutId={payout.id} label="Reject" />
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
  payoutId,
  label,
}: {
  payoutId: string
  label: string
}) {
  return (
    <PreviewForm className="flex gap-2">
      <input type="hidden" name="payoutId" value={payoutId} />
      <Input name="adminNote" placeholder="Admin note" />
      <Button type="submit" size="sm" variant="outline">
        {label}
      </Button>
    </PreviewForm>
  )
}
