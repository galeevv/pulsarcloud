import { AdminNodeForm } from "@/components/admin/admin-node-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { previewAdminNodes } from "@/src/frontend-preview/fixtures/mock-admin"

export default function AdminNodesPage() {
  const nodes = previewAdminNodes

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>Nodes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Protocol</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Capacity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node) => (
                <TableRow key={node.id}>
                  <TableCell>{node.name}</TableCell>
                  <TableCell>
                    {node.country}, {node.city}
                  </TableCell>
                  <TableCell>{node.type}</TableCell>
                  <TableCell>{node.protocol}</TableCell>
                  <TableCell>{node.status}</TableCell>
                  <TableCell>{node.capacity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>Add node</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminNodeForm />
        </CardContent>
      </Card>
    </div>
  )
}
