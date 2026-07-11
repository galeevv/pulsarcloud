import { PreviewForm } from "@/components/frontend-preview/preview-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { previewPricing } from "@/src/frontend-preview/fixtures/mock-pricing"

export default function AdminSettingsPage() {
  const settings = previewPricing
  const legalDocuments = [
    {
      id: "agreement",
      slug: "agreement",
      title: "Пользовательское соглашение",
    },
    { id: "offer", slug: "offer", title: "Публичная оферта" },
    {
      id: "confidentiality",
      slug: "confidentiality",
      title: "Политика конфиденциальности",
    },
  ]
  const discounts = new Map(
    settings.durationOptions.map((item) => [item.months, item.discountPct])
  )
  const integrations = [
    ["Payments", false],
    ["Email", false],
    ["Telegram", false],
    ["VPN provisioning", false],
  ] as const

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>Pricing Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <PreviewForm className="flex flex-col gap-3">
            <FieldGroup>
              <Field>
                <FieldLabel>Base monthly price</FieldLabel>
                <Input
                  name="baseMonthlyPriceRub"
                  type="number"
                  defaultValue={settings.baseMonthlyPriceRub}
                />
              </Field>
              <Field>
                <FieldLabel>Extra device monthly price</FieldLabel>
                <Input
                  name="extraDeviceMonthlyPriceRub"
                  type="number"
                  defaultValue={settings.extraDeviceMonthlyPriceRub}
                />
              </Field>
              <Field>
                <FieldLabel>LTE monthly price</FieldLabel>
                <Input
                  name="lteMonthlyPriceRub"
                  type="number"
                  defaultValue={settings.lteMonthlyPriceRub}
                />
              </Field>
              <Field>
                <FieldLabel>Friend discount %</FieldLabel>
                <Input
                  name="referralFriendDiscountPct"
                  type="number"
                  defaultValue={settings.referralFriendDiscountPct}
                />
              </Field>
              <Field>
                <FieldLabel>Referral reward RUB</FieldLabel>
                <Input
                  name="referralRewardRub"
                  type="number"
                  defaultValue={settings.referralRewardRub}
                />
              </Field>
              <Field>
                <FieldLabel>Minimal payout RUB</FieldLabel>
                <Input
                  name="minimalPayoutRub"
                  type="number"
                  defaultValue={settings.minimalPayoutRub}
                />
              </Field>
              <Field>
                <FieldLabel>Minimum devices</FieldLabel>
                <Input
                  name="minDeviceLimit"
                  type="number"
                  defaultValue={settings.minDeviceLimit}
                />
              </Field>
              <Field>
                <FieldLabel>Maximum devices</FieldLabel>
                <Input
                  name="maxDeviceLimit"
                  type="number"
                  defaultValue={settings.maxDeviceLimit}
                />
              </Field>
              {[1, 3, 6, 12].map((months) => (
                <Field key={months}>
                  <FieldLabel>
                    Discount for {months} month{months === 1 ? "" : "s"}, %
                  </FieldLabel>
                  <Input
                    name={`discount${months}`}
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={discounts.get(months) ?? 0}
                  />
                </Field>
              ))}
            </FieldGroup>
            <Button type="submit">Save settings</Button>
          </PreviewForm>
        </CardContent>
      </Card>
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {integrations.map(([name, configured]) => (
            <div
              key={name}
              className="soft-panel flex items-center justify-between p-3"
            >
              <span>{name}</span>
              <span
                className={
                  configured ? "text-emerald-400" : "text-muted-foreground"
                }
              >
                {configured ? "configured" : "disabled"}
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Значения секретов намеренно не отображаются.
          </p>
        </CardContent>
      </Card>
      <Card className="glass-card rounded-3xl">
        <CardHeader>
          <CardTitle>Legal Documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {legalDocuments.map((doc) => (
            <div key={doc.id} className="soft-panel p-4">
              <p className="font-medium">{doc.title}</p>
              <p className="text-sm text-muted-foreground">/legal/{doc.slug}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
