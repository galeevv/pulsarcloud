"use client"

import { useState } from "react"

import { PreviewForm } from "@/components/frontend-preview/preview-form"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const nodeTypes = ["REGULAR", "LTE", "GAMING"]
const nodeProtocols = ["VLESS_REALITY", "HYSTERIA", "VLESS_XHTTP_TLS"]
const nodeStatuses = ["ACTIVE", "MAINTENANCE", "DISABLED"]

export function AdminNodeForm() {
  const [type, setType] = useState("REGULAR")
  const [protocol, setProtocol] = useState("VLESS_REALITY")
  const [status, setStatus] = useState("ACTIVE")

  return (
    <PreviewForm className="flex flex-col gap-3">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="protocol" value={protocol} />
      <input type="hidden" name="status" value={status} />
      <FieldGroup>
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input name="name" />
        </Field>
        <Field>
          <FieldLabel>Country</FieldLabel>
          <Input name="country" />
        </Field>
        <Field>
          <FieldLabel>City</FieldLabel>
          <Input name="city" />
        </Field>
        <Field>
          <FieldLabel>Domain</FieldLabel>
          <Input name="domain" />
        </Field>
        <Field>
          <FieldLabel>Capacity</FieldLabel>
          <Input name="capacity" type="number" defaultValue={100} />
        </Field>
        <Field>
          <FieldLabel>Sort order</FieldLabel>
          <Input name="sortOrder" type="number" defaultValue={100} />
        </Field>
        <SelectField
          label="Type"
          value={type}
          items={nodeTypes}
          onChange={setType}
        />
        <SelectField
          label="Protocol"
          value={protocol}
          items={nodeProtocols}
          onChange={setProtocol}
        />
        <SelectField
          label="Status"
          value={status}
          items={nodeStatuses}
          onChange={setStatus}
        />
      </FieldGroup>
      <Button type="submit">Create</Button>
    </PreviewForm>
  )
}

function SelectField({
  label,
  value,
  items,
  onChange,
}: {
  label: string
  value: string
  items: string[]
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={items.map((item) => ({ label: item, value: item }))}
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) {
            onChange(nextValue)
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
