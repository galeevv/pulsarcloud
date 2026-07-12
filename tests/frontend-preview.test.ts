import assert from "node:assert/strict"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = process.cwd()

const routeFiles = [
  "app/page.tsx",
  "app/auth/verify/page.tsx",
  "app/(dashboard)/home/page.tsx",
  "app/(dashboard)/subscription/page.tsx",
  "app/(dashboard)/referrals/page.tsx",
  "app/(dashboard)/profile/page.tsx",
  "app/(dashboard)/support/page.tsx",
  "app/(dashboard)/legal/page.tsx",
]

async function collectFiles(directory: string): Promise<string[]> {
  const absolute = path.join(root, directory)
  const entries = await readdir(absolute)
  const files: string[] = []

  for (const entry of entries) {
    const child = path.join(absolute, entry)
    const details = await stat(child)
    if (details.isDirectory()) {
      files.push(...(await collectFiles(path.relative(root, child))))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(child)
    }
  }

  return files
}

test("all user frontend route modules remain present", async () => {
  for (const route of routeFiles) {
    const source = await readFile(path.join(root, route), "utf8")
    assert.match(source, /export default/)
  }
})

test("navigation and primary preview interfaces remain wired", async () => {
  const navigation = await readFile(
    path.join(root, "components/app/bottom-nav.tsx"),
    "utf8"
  )
  for (const href of ["/home", "/subscription", "/referrals", "/profile"]) {
    assert.ok(navigation.includes(href), `missing navigation target ${href}`)
  }

  const checkout = await readFile(
    path.join(root, "components/app/subscription-payment-action.tsx"),
    "utf8"
  )
  assert.match(checkout, /<Drawer/)
  assert.match(checkout, /<Dialog/)

  const profile = await readFile(
    path.join(root, "app/(dashboard)/profile/page.tsx"),
    "utf8"
  )
  assert.match(profile, /LoginMethodsManager/)

  const support = await readFile(
    path.join(root, "app/(dashboard)/support/page.tsx"),
    "utf8"
  )
  assert.match(support, /SupportThread/)
  assert.match(support, /SupportComposer/)
})

test("legal documents remain readable", async () => {
  for (const document of ["agreement.md", "offer.md", "confidentiality.md"]) {
    const contents = await readFile(path.join(root, "docs", document), "utf8")
    assert.ok(contents.trim().length > 100)
  }
})

test("active frontend has no legacy server imports or secret names", async () => {
  const activeFiles = (
    await Promise.all(
      ["app", "components", "hooks", "lib", "src/frontend-preview"].map(
        collectFiles
      )
    )
  ).flat()
  const forbiddenImports = [
    "@pri" + "s" + "ma",
    "better-" + "sqlite3",
    "@/lib/" + "db",
    "@/lib/" + "auth",
    "@/src/server",
    "@/generated/" + "pri" + "s" + "ma",
  ]
  const secretNames = [
    "DATA" + "BASE_URL",
    "SES" + "SION_" + "SECRET",
    "PLA" + "TEGA_" + "SECRET",
    "RE" + "SEND_" + "API_KEY",
    "TELEGRAM_" + "BOT_TOKEN",
    "REM" + "NAWAVE_" + "API_TOKEN",
  ]

  for (const file of activeFiles) {
    const source = await readFile(file, "utf8")
    for (const forbidden of [...forbiddenImports, ...secretNames]) {
      assert.ok(
        !source.includes(forbidden),
        `${path.relative(root, file)} contains ${forbidden}`
      )
    }
  }
})

test("no active route handler or server action remains", async () => {
  const appFiles = await collectFiles("app")
  assert.deepEqual(
    appFiles.filter((file) => path.basename(file) === "route.ts"),
    []
  )

  for (const file of appFiles) {
    const source = await readFile(file, "utf8")
    assert.ok(!source.includes("use " + "server"))
  }
})
