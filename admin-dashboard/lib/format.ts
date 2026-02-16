const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
}

const DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
}

const CURRENCY_OPTIONS: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()
const datetimeFormatterCache = new Map<string, Intl.DateTimeFormat>()
const numberFormatterCache = new Map<string, Intl.NumberFormat>()
const currencyFormatterCache = new Map<string, Intl.NumberFormat>()

function normalizeLocale(locale?: string): string {
  if (!locale) return "fr-FR"

  const normalized = locale.toLowerCase().trim()
  if (normalized === "fr" || normalized.startsWith("fr-")) return "fr-FR"
  if (normalized === "en" || normalized.startsWith("en-")) return "en-US"

  return locale
}

function getDateFormatter(locale?: string): Intl.DateTimeFormat {
  const resolvedLocale = normalizeLocale(locale)
  if (!dateFormatterCache.has(resolvedLocale)) {
    dateFormatterCache.set(
      resolvedLocale,
      new Intl.DateTimeFormat(resolvedLocale, DATE_OPTIONS)
    )
  }
  return dateFormatterCache.get(resolvedLocale)!
}

function getDateTimeFormatter(locale?: string): Intl.DateTimeFormat {
  const resolvedLocale = normalizeLocale(locale)
  if (!datetimeFormatterCache.has(resolvedLocale)) {
    datetimeFormatterCache.set(
      resolvedLocale,
      new Intl.DateTimeFormat(resolvedLocale, DATETIME_OPTIONS)
    )
  }
  return datetimeFormatterCache.get(resolvedLocale)!
}

function getNumberFormatter(locale?: string): Intl.NumberFormat {
  const resolvedLocale = normalizeLocale(locale)
  if (!numberFormatterCache.has(resolvedLocale)) {
    numberFormatterCache.set(resolvedLocale, new Intl.NumberFormat(resolvedLocale))
  }
  return numberFormatterCache.get(resolvedLocale)!
}

function getCurrencyFormatter(locale?: string): Intl.NumberFormat {
  const resolvedLocale = normalizeLocale(locale)
  if (!currencyFormatterCache.has(resolvedLocale)) {
    currencyFormatterCache.set(
      resolvedLocale,
      new Intl.NumberFormat(resolvedLocale, CURRENCY_OPTIONS)
    )
  }
  return currencyFormatterCache.get(resolvedLocale)!
}

export function formatDate(value?: string | null, locale?: string): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return getDateFormatter(locale).format(date)
}

export function formatDateTime(value?: string | null, locale?: string): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return getDateTimeFormatter(locale).format(date)
}

export function formatNumber(value?: number | null, locale?: string): string {
  return getNumberFormatter(locale).format(value ?? 0)
}

export function formatCurrency(value?: number | null, locale?: string): string {
  return getCurrencyFormatter(locale).format(value ?? 0)
}

export function formatDateFr(value?: string | null): string {
  return formatDate(value, "fr-FR")
}

export function formatDateTimeFr(value?: string | null): string {
  return formatDateTime(value, "fr-FR")
}

export function formatNumberFr(value?: number | null): string {
  return formatNumber(value, "fr-FR")
}

export function formatCurrencyFr(value?: number | null): string {
  return formatCurrency(value, "fr-FR")
}

