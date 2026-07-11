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
import {
  previewAdminReferralInvites,
  previewAdminReferralProfiles,
  previewAdminReferralRewards,
} from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminReferralsPage() {
  const profiles = previewAdminReferralProfiles
  const invites = previewAdminReferralInvites
  const rewards = previewAdminReferralRewards

  return (
    <div className="flex flex-col gap-4">
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>Referral Profiles</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.userId}>
                  <TableCell>
                    {getPreviewUserLabel(profile.user.authIdentities)}
                  </TableCell>
                  <TableCell>{profile.inviteCode}</TableCell>
                  <TableCell>
                    <Badge>{profile.isEnabled ? "enabled" : "locked"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>Invites / Rewards</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inviter</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reward</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => {
                const reward = rewards.find(
                  (item) => item.invitedUserId === invite.invitedUserId
                )
                return (
                  <TableRow key={invite.id}>
                    <TableCell>
                      {getPreviewUserLabel(invite.inviter.authIdentities)}
                    </TableCell>
                    <TableCell>
                      {getPreviewUserLabel(invite.invited.authIdentities)}
                    </TableCell>
                    <TableCell>{invite.status}</TableCell>
                    <TableCell>
                      {reward
                        ? `${formatPreviewRub(reward.amountRub)} · ${reward.status}`
                        : "—"}
                    </TableCell>
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
