"use client"

import * as React from "react"

import { en } from "./en"
import { fr } from "./fr"
import type { Locale, Messages } from "./types"

export type { Locale, Messages } from "./types"

export const DEFAULT_LOCALE: Locale = "fr"
export const LOCALE_STORAGE_KEY = "prospect:locale"

const MESSAGES_BY_LOCALE: Record<Locale, Messages> = {
  fr,
  en,
}

function readPath(obj: unknown, path: string): string | undefined {
  const keys = path.split(".")
  let current: unknown = obj

  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === "string" ? current : undefined
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "fr" || value === "en"
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE

  const normalized = value.toLowerCase().trim()
  if (normalized.startsWith("fr")) return "fr"
  if (normalized.startsWith("en")) return "en"

  return DEFAULT_LOCALE
}

export function toIntlLocale(locale: Locale): string {
  return locale === "en" ? "en-US" : "fr-FR"
}

export function getMessages(locale: Locale): Messages {
  return MESSAGES_BY_LOCALE[locale] || fr
}

export function t(path: string, locale: Locale = DEFAULT_LOCALE): string {
  const localizedValue = readPath(getMessages(locale), path)
  if (localizedValue) return localizedValue

  const fallbackFrValue = readPath(fr, path)
  if (fallbackFrValue) return fallbackFrValue

  return path
}

type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  messages: Messages
  t: (path: string) => string
}

const I18nContext = React.createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  messages: fr,
  t: (path: string) => t(path, DEFAULT_LOCALE),
})

export function I18nProvider({
  children,
  defaultLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode
  defaultLocale?: Locale
}) {
  const [locale, setLocaleState] = React.useState<Locale>(defaultLocale)

  React.useEffect(() => {
    try {
      const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)
      if (!storedLocale) return
      setLocaleState(normalizeLocale(storedLocale))
    } catch {
      setLocaleState(defaultLocale)
    }
  }, [defaultLocale])

  React.useEffect(() => {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Ignore storage write issues (private mode, disabled storage).
    }
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = React.useCallback((nextLocale: Locale) => {
    setLocaleState(normalizeLocale(nextLocale))
  }, [])

  const messages = React.useMemo(() => getMessages(locale), [locale])
  const translate = React.useCallback((path: string) => t(path, locale), [locale])

  const value = React.useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      messages,
      t: translate,
    }),
    [locale, setLocale, messages, translate],
  )

  return React.createElement(I18nContext.Provider, { value }, children)
}

export function useI18n(): I18nContextValue {
  return React.useContext(I18nContext)
}
