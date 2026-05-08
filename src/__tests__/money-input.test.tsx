// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import * as React from "react"
import { MoneyInput } from "#/components/ui/money-input"

afterEach(cleanup)

function ControlledInput({ initial = "" }: { initial?: string }) {
  const [value, setValue] = React.useState(initial)
  return (
    <MoneyInput
      currency="UGX"
      roundTo={50}
      value={value}
      onChange={setValue}
    />
  )
}

describe("MoneyInput with roundTo={50}", () => {
  it("floors a non-multiple value on blur", () => {
    render(<ControlledInput />)
    const input = screen.getByRole<HTMLInputElement>("textbox")
    fireEvent.change(input, { target: { value: "1237" } })
    fireEvent.blur(input)
    expect(input.value).toBe("1,200")
  })

  it("leaves an exact multiple unchanged on blur", () => {
    render(<ControlledInput />)
    const input = screen.getByRole<HTMLInputElement>("textbox")
    fireEvent.change(input, { target: { value: "1250" } })
    fireEvent.blur(input)
    expect(input.value).toBe("1,250")
  })

  it("does not modify an empty input on blur", () => {
    render(<ControlledInput />)
    const input = screen.getByRole<HTMLInputElement>("textbox")
    fireEvent.blur(input)
    expect(input.value).toBe("")
  })

  it("floors abs() and reapplies sign for negative values", () => {
    render(<ControlledInput />)
    const input = screen.getByRole<HTMLInputElement>("textbox")
    fireEvent.change(input, { target: { value: "-1237" } })
    fireEvent.blur(input)
    expect(input.value).toBe("-1,200")
  })

  it("calls onChange with the floored raw value (no commas)", () => {
    const onChange = vi.fn()
    render(
      <MoneyInput currency="UGX" roundTo={50} value="" onChange={onChange} />,
    )
    const input = screen.getByRole<HTMLInputElement>("textbox")
    fireEvent.change(input, { target: { value: "1237" } })
    fireEvent.blur(input)
    // Last call after blur should be with the floored value
    expect(onChange).toHaveBeenLastCalledWith("1200")
  })
})
