import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Bienvenue | Prospect",
  description: "Identifiez-vous pour continuer",
}

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
