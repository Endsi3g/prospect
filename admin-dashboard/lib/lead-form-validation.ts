export function isValidLeadEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidLeadPhone(phone: string): boolean {
  if (!phone.trim()) return true
  return /^[+()\d\s-]{6,20}$/.test(phone.trim())
}
