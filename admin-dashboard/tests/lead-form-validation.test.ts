import { describe, expect, it } from "vitest"

import { isValidLeadEmail, isValidLeadPhone } from "../lib/lead-form-validation"

describe("lead form validation helpers", () => {
  it("validates common email formats", () => {
    expect(isValidLeadEmail("alice@example.com")).toBe(true)
    expect(isValidLeadEmail("bob.smith+eu@prospect.co")).toBe(true)
    expect(isValidLeadEmail("invalid-email")).toBe(false)
    expect(isValidLeadEmail("bad@domain")).toBe(false)
  })

  it("accepts optional or valid phone values and rejects invalid ones", () => {
    expect(isValidLeadPhone("")).toBe(true)
    expect(isValidLeadPhone(" +1 (555) 000-0000 ")).toBe(true)
    expect(isValidLeadPhone("+33 1 44 00 00 00")).toBe(true)
    expect(isValidLeadPhone("12345")).toBe(false)
    expect(isValidLeadPhone("abcde123")).toBe(false)
  })
})
