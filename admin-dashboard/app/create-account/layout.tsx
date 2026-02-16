import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Creer un compte | Prospect",
  description: "Inscription a la console Prospect",
}

export default function CreateAccountLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
