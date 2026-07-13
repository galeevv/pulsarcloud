"use client"
import { useState } from "react"
import { LogOutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
export function LogoutAction() { const [pending, setPending] = useState(false); return <Button type="button" variant="outline" className="w-full text-destructive" disabled={pending} onClick={async () => { setPending(true); await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/") }}><LogOutIcon data-icon="inline-start" />{pending ? "Выходим…" : "Выйти"}</Button> }
