import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { FieldLabel } from '#/components/ui/field-label'
import { Textarea } from '#/components/ui/textarea'
import { Combobox } from '#/components/ui/combobox'
import { COUNTRIES } from '#/lib/countries'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  createSupplier,
  updateSupplier,
} from '#/server/functions/supply/suppliers'

export type SupplierFormRecord = Awaited<ReturnType<typeof createSupplier>>

type SupplierType = SupplierFormRecord['type']

export function SupplierForm({
  supplier,
  initialName = '',
  idPrefix = 'supplier',
  onSuccess,
  onCancel,
}: {
  supplier?: SupplierFormRecord
  initialName?: string
  idPrefix?: string
  onSuccess: (supplier: SupplierFormRecord) => void | Promise<void>
  onCancel?: () => void
}) {
  const [name, setName] = useState(supplier?.name ?? initialName.trim())
  const [type, setType] = useState<SupplierType>(
    supplier?.type ?? 'international',
  )
  const [country, setCountry] = useState(supplier?.country ?? '')
  const [contactName, setContactName] = useState(supplier?.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(supplier?.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(supplier?.contactEmail ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = supplier !== undefined

  useEffect(() => {
    setName(supplier?.name ?? initialName.trim())
    setType(supplier?.type ?? 'international')
    setCountry(supplier?.country ?? '')
    setContactName(supplier?.contactName ?? '')
    setContactPhone(supplier?.contactPhone ?? '')
    setContactEmail(supplier?.contactEmail ?? '')
    setAddress(supplier?.address ?? '')
    setNotes(supplier?.notes ?? '')
    setError(null)
  }, [initialName, supplier])

  function fieldId(field: string) {
    return `${idPrefix}-${field}`
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Supplier name is required')
      return
    }

    setPending(true)
    setError(null)
    const values = {
      name: trimmedName,
      type,
      country: country.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    try {
      const saved = supplier
        ? await updateSupplier({ data: { id: supplier.id, ...values } })
        : await createSupplier({ data: values })
      await onSuccess(saved)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Something went wrong.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <div className="space-y-2">
        <FieldLabel htmlFor={fieldId('name')} help="supplier.name">
          Name *
        </FieldLabel>
        <Input
          id={fieldId('name')}
          value={name}
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor={fieldId('type')} help="supplier.type">
          Type *
        </FieldLabel>
        <Select
          value={type}
          disabled={pending}
          onValueChange={(value) => setType(value as SupplierType)}
        >
          <SelectTrigger id={fieldId('type')} disabled={pending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">Local</SelectItem>
            <SelectItem value="international">International</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor={fieldId('country')} help="supplier.country">
          Country
        </FieldLabel>
        <Combobox
          id={fieldId('country')}
          options={COUNTRIES}
          value={country}
          onChange={setCountry}
          placeholder="Select country"
          searchPlaceholder="Search countries..."
          emptyMessage="No countries match."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel
            htmlFor={fieldId('contact-name')}
            help="supplier.contactName"
          >
            Contact Name
          </FieldLabel>
          <Input
            id={fieldId('contact-name')}
            value={contactName}
            disabled={pending}
            onChange={(event) => setContactName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel
            htmlFor={fieldId('contact-phone')}
            help="supplier.contactPhone"
          >
            Phone
          </FieldLabel>
          <Input
            id={fieldId('contact-phone')}
            value={contactPhone}
            disabled={pending}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel
          htmlFor={fieldId('contact-email')}
          help="supplier.contactEmail"
        >
          Email
        </FieldLabel>
        <Input
          id={fieldId('contact-email')}
          type="email"
          value={contactEmail}
          disabled={pending}
          onChange={(event) => setContactEmail(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor={fieldId('address')}>Address</FieldLabel>
        <Textarea
          id={fieldId('address')}
          rows={2}
          value={address}
          disabled={pending}
          onChange={(event) => setAddress(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor={fieldId('notes')} help="supplier.notes">
          Notes
        </FieldLabel>
        <Textarea
          id={fieldId('notes')}
          rows={2}
          value={notes}
          disabled={pending}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {error ? (
        <div role="alert" className="text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className={onCancel ? 'flex justify-end gap-2' : undefined}>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          className={onCancel ? undefined : 'w-full'}
          disabled={pending}
        >
          {pending
            ? isEditing
              ? 'Saving...'
              : 'Creating...'
            : isEditing
              ? 'Save Changes'
              : 'Create Supplier'}
        </Button>
      </div>
    </form>
  )
}
