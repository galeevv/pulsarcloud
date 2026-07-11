import {
  changeSubscriptionDeviceLimitAction,
  extendSubscriptionAction,
  regenerateAdminSubscriptionUrlAction,
  syncAdminSubscriptionAction,
  toggleSubscriptionLteAction,
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
import { getUserLabel } from "@/lib/user-identity"

export default async function AdminSubscriptionsPage() {
  const subscriptions = await prisma.subscription.findMany({
    include: { user: { include: { authIdentities: true } } },
    orderBy: { createdAt: "desc" },
  })

  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader>
        <CardTitle>Subscriptions</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Devices</TableHead>
              <TableHead>LTE</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscriptions.map((subscription) => (
              <TableRow key={subscription.id}>
                <TableCell>{getUserLabel(subscription.user.authIdentities)}</TableCell>
                <TableCell><Badge>{subscription.status}</Badge></TableCell>
                <TableCell>
                  {subscription.startsAt?.toLocaleDateString("ru-RU") ?? "—"} → {subscription.expiresAt?.toLocaleDateString("ru-RU") ?? "—"}
                </TableCell>
                <TableCell>{subscription.deviceLimit}</TableCell>
                <TableCell>{subscription.lteEnabled ? "yes" : "no"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{subscription.syncStatus}</Badge>
                  {subscription.lastTechnicalError ? (
                    <p className="mt-1 max-w-xs truncate text-xs text-destructive">
                      {subscription.lastTechnicalError}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-80 flex-col gap-2">
                    <form action={extendSubscriptionAction} className="flex gap-2">
                      <input type="hidden" name="subscriptionId" value={subscription.id} />
                      <Input name="months" type="number" defaultValue={1} className="w-24" />
                      <Button type="submit" size="sm">Продлить</Button>
                    </form>
                    <form action={changeSubscriptionDeviceLimitAction} className="flex gap-2">
                      <input type="hidden" name="subscriptionId" value={subscription.id} />
                      <Input name="deviceLimit" type="number" defaultValue={subscription.deviceLimit} className="w-24" />
                      <Button type="submit" size="sm" variant="outline">Лимит</Button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleSubscriptionLteAction}>
                        <input type="hidden" name="subscriptionId" value={subscription.id} />
                        <input type="hidden" name="enabled" value={String(!subscription.lteEnabled)} />
                        <Button type="submit" size="sm" variant="outline">
                          {subscription.lteEnabled ? "LTE off" : "LTE on"}
                        </Button>
                      </form>
                      <form action={regenerateAdminSubscriptionUrlAction}>
                        <input type="hidden" name="subscriptionId" value={subscription.id} />
                        <Button type="submit" size="sm" variant="outline">Новая ссылка</Button>
                      </form>
                      <form action={syncAdminSubscriptionAction}>
                        <input type="hidden" name="subscriptionId" value={subscription.id} />
                        <Button type="submit" size="sm" variant="outline">Mock sync</Button>
                      </form>
                    </div>
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
