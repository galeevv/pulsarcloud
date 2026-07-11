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

export default async function AdminReferralsPage() {
  const [profiles, invites, rewards] = await Promise.all([
    prisma.referralProfile.findMany({
      include: { user: { include: { authIdentities: true } } },
    }),
    prisma.referralInvite.findMany({
      include: {
        inviter: { include: { authIdentities: true } },
        invited: { include: { authIdentities: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.referralReward.findMany({
      include: {
        inviter: { include: { authIdentities: true } },
        invited: { include: { authIdentities: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <Card className="glass-card rounded-3xl">
        <CardHeader><CardTitle>Referral Profiles</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Link</TableHead><TableHead>Enabled</TableHead></TableRow></TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.userId}>
                  <TableCell>{getUserLabel(profile.user.authIdentities)}</TableCell>
                  <TableCell>{profile.inviteCode}</TableCell>
                  <TableCell><Badge>{profile.isEnabled ? "enabled" : "locked"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-card rounded-3xl">
        <CardHeader><CardTitle>Invites / Rewards</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Inviter</TableHead><TableHead>Invited</TableHead><TableHead>Status</TableHead><TableHead>Reward</TableHead></TableRow></TableHeader>
            <TableBody>
              {invites.map((invite) => {
                const reward = rewards.find((item) => item.invitedUserId === invite.invitedUserId)
                return (
                  <TableRow key={invite.id}>
                    <TableCell>{getUserLabel(invite.inviter.authIdentities)}</TableCell>
                    <TableCell>{getUserLabel(invite.invited.authIdentities)}</TableCell>
                    <TableCell>{invite.status}</TableCell>
                    <TableCell>{reward ? `${formatRub(reward.amountRub)} · ${reward.status}` : "—"}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
