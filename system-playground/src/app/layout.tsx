import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prospect AI | System Playground",
  description: "High-level command center for system diagnostics and manual interaction.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="overflow-x-hidden selection:bg-primary/30">
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.03),transparent_100%)] pointer-events-none" />
        <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] brightness-100 contrast-150 pointer-events-none" />
        <main className="relative min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
