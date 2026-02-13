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
    <html lang="en" className="dark">
      <body className="overflow-x-hidden selection:bg-primary/30">
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.03),transparent_100%)] pointer-events-none" />
        <div className="fixed inset-0 opacity-[0.02] brightness-100 contrast-150 pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
        <main className="relative min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
