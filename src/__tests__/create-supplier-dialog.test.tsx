// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateSupplierDialog } from '#/components/supply/create-supplier-dialog'

const { createSupplier } = vi.hoisted(() => ({
  createSupplier: vi.fn(),
}))

vi.mock('#/server/functions/supply/suppliers', () => ({ createSupplier }))

vi.mock('#/components/ui/responsive-dialog', () => ({
  ResponsiveDialog: ({
    open,
    children,
  }: {
    open?: boolean
    children: React.ReactNode
  }) => (open ? <div role="dialog">{children}</div> : null),
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  ResponsiveDialogDescription: ({
    children,
  }: {
    children: React.ReactNode
  }) => <p>{children}</p>,
  ResponsiveDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
Element.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)

beforeEach(() => {
  createSupplier.mockReset()
})

describe('CreateSupplierDialog', () => {
  it('prefills the typed supplier name and creates the supplier', async () => {
    const onCreated = vi.fn()
    const onOpenChange = vi.fn()
    createSupplier.mockResolvedValueOnce({
      id: 'supplier-new',
      name: 'Danny',
      type: 'international',
      country: 'Uganda',
      contactName: 'Diana',
      contactPhone: '+256700000000',
      contactEmail: 'diana@example.com',
      address: 'Kampala',
      notes: 'Textile supplier',
    })

    render(
      <CreateSupplierDialog
        open
        initialName=" danny "
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Name *' })).toHaveProperty(
      'value',
      'danny',
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Country' }))
    fireEvent.change(screen.getByPlaceholderText('Search countries...'), {
      target: { value: 'Uganda' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'Uganda' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Contact Name' }), {
      target: { value: 'Diana' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Phone' }), {
      target: { value: '+256700000000' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'diana@example.com' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Address' }), {
      target: { value: 'Kampala' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), {
      target: { value: 'Textile supplier' },
    })
    const submitButton = screen.getByRole('button', {
      name: 'Create Supplier',
    })
    const form = submitButton.closest('form')
    if (!form) throw new Error('Create supplier button is outside a form')
    fireEvent.submit(form)

    await waitFor(() => expect(createSupplier).toHaveBeenCalledOnce())
    expect(createSupplier).toHaveBeenCalledWith({
      data: {
        name: 'danny',
        type: 'international',
        country: 'Uganda',
        contactName: 'Diana',
        contactPhone: '+256700000000',
        contactEmail: 'diana@example.com',
        address: 'Kampala',
        notes: 'Textile supplier',
      },
    })
    expect(onCreated).toHaveBeenCalledWith({
      id: 'supplier-new',
      name: 'Danny',
    })
  })

  it('keeps the dialog open and preserves fields when creation fails', async () => {
    createSupplier.mockRejectedValueOnce(new Error('Supplier already exists'))

    render(
      <CreateSupplierDialog
        open
        initialName="danny"
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), {
      target: { value: 'Textile supplier' },
    })
    const submitButton = screen.getByRole('button', {
      name: 'Create Supplier',
    })
    const form = submitButton.closest('form')
    if (!form) throw new Error('Create supplier button is outside a form')
    fireEvent.submit(form)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Supplier already exists',
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveProperty(
      'value',
      'Textile supplier',
    )
  })

  it('allows cancel without creating a supplier', () => {
    const onOpenChange = vi.fn()
    render(
      <CreateSupplierDialog
        open
        initialName="danny"
        onOpenChange={onOpenChange}
        onCreated={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(createSupplier).not.toHaveBeenCalled()
  })
})
