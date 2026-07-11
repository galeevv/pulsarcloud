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
import { getPreviewUserLabel } from "@/src/frontend-preview/format"
import { previewAdminSubscriptions } from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminSubscriptionsPage() {
  const subscriptions = previewAdminSubscriptions

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
                <TableCell>
                  {getPreviewUserLabel(subscription.user.authIdentities)}
                </TableCell>
                <TableCell>
                  <Badge>{subscription.status}</Badge>
                </TableCell>
                <TableCell>
                  {subscription.startsAt?.toLocaleDateString("ru-RU") ?? "—"} →{" "}
                  {subscription.expiresAt?.toLocaleDateString("ru-RU") ?? "—"}
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
                    <PreviewForm className="flex gap-2">
                      <input
                        type="hidden"
                        name="subscriptionId"
                        value={subscription.id}
                      />
                      <Input
                        name="months"
                        type="number"
                        defaultValue={1}
                        className="w-24"
                      />
                      <Button type="submit" size="sm">
                        Продлить
                      </Button>
                    </PreviewForm>
                    <PreviewForm className="flex gap-2">
                      <input
                        type="hidden"
                        name="subscriptionId"
                        value={subscription.id}
                      />
                      <Input
                        name="deviceLimit"
                        type="number"
                        defaultValue={subscription.deviceLimit}
                        className="w-24"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Лимит
                      </Button>
                    </PreviewForm>
                    <div className="flex flex-wrap gap-2">
                      <PreviewForm>
                        <input
                          type="hidden"
                          name="subscriptionId"
                          value={subscription.id}
                        />
                        <input
                          type="hidden"
                          name="enabled"
                          value={String(!subscription.lteEnabled)}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          {subscription.lteEnabled ? "LTE off" : "LTE on"}
                        </Button>
                      </PreviewForm>
                      <PreviewForm>
                        <input
                          type="hidden"
                          name="subscriptionId"
                          value={subscription.id}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Новая ссылка
                        </Button>
                      </PreviewForm>
                      <PreviewForm>
                        <input
                          type="hidden"
                          name="subscriptionId"
                          value={subscription.id}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Sync
                        </Button>
                      </PreviewForm>
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
