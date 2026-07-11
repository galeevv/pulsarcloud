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
import { formatPreviewRub } from "@/src/frontend-preview/format"
import { previewAdminUsers } from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminUsersPage() {
  const users = previewAdminUsers

  return (
    <Card className="glass-card rounded-3xl">
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  {user.authIdentities.find((item) => item.provider === "EMAIL")
                    ?.providerSubject ?? "—"}
                </TableCell>
                <TableCell>
                  {user.authIdentities.find(
                    (item) => item.provider === "TELEGRAM"
                  )?.providerSubject ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge>{user.role}</Badge>
                </TableCell>
                <TableCell>{formatPreviewRub(user.balanceRub)}</TableCell>
                <TableCell>{user.subscription?.status ?? "NONE"}</TableCell>
                <TableCell>
                  {user.createdAt.toLocaleDateString("ru-RU")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
