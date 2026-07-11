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
import { getIdentitySubject } from "@/lib/user-identity"

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    include: {
      subscription: true,
      authIdentities: true,
    },
    orderBy: { createdAt: "desc" },
  })

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
                <TableCell>{getIdentitySubject(user.authIdentities, "EMAIL") ?? "—"}</TableCell>
                <TableCell>{getIdentitySubject(user.authIdentities, "TELEGRAM") ?? "—"}</TableCell>
                <TableCell><Badge>{user.role}</Badge></TableCell>
                <TableCell>{formatRub(user.balanceRub)}</TableCell>
                <TableCell>{user.subscription?.status ?? "NONE"}</TableCell>
                <TableCell>{user.createdAt.toLocaleDateString("ru-RU")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
