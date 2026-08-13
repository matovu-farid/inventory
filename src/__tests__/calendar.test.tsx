// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Calendar } from '#/components/ui/calendar'

afterEach(cleanup)

describe('Calendar month and year navigation', () => {
  it('keeps the visible caption while layering accessible dropdown controls over it', () => {
    const { container } = render(
      <Calendar mode="single" month={new Date(2026, 7, 13)} />,
    )

    expect(screen.getByText('August 2026').classList.contains('sr-only')).toBe(
      false,
    )

    const dropdowns = screen.getAllByRole('combobox')
    expect(dropdowns).toHaveLength(2)
    expect(dropdowns[0].classList).toContain('absolute')
    expect(dropdowns[0].classList).toContain('inset-0')
    expect(dropdowns[0].classList).toContain('opacity-0')
    expect(dropdowns[1].classList).toContain('absolute')
    expect(dropdowns[1].classList).toContain('inset-0')
    expect(dropdowns[1].classList).toContain('opacity-0')

    expect(container.querySelector('[data-slot="calendar"]')).toBeTruthy()
  })
})
