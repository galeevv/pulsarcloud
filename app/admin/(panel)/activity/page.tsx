import { redirect } from "next/navigation"

export default function AdminActivityPage() {
  redirect("/admin/operations?tab=audit")
}
