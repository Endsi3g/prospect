"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Terminal, Shield, Lock, ArrowRight } from "lucide-react";
import { requestApi } from "@/lib/api";

export default function LoginPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await requestApi("/api/v1/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Authentification échouée");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {/* Glow effect */}
        <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-primary/50 to-accent/50 opacity-20 blur-xl" />

        <div className="relative rounded-lg border border-border bg-background/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <Shield size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              SYSTÈME <span className="text-primary">PLAYGROUND</span>
            </h1>
            <p className="mt-2 text-sm text-foreground/50">
              Interface d&apos;accès au centre de commande tactique.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="login-username" className="text-xs font-semibold uppercase tracking-wider text-primary/70">Identifiant</label>
              <div className="relative">
                <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/50" size={16} />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded border border-border bg-input py-3 pl-10 pr-4 text-sm text-foreground outline-none ring-primary/30 transition focus:border-primary focus:ring-2"
                  placeholder="admin"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-xs font-semibold uppercase tracking-wider text-primary/70">Code d&apos;accès</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-primary/50" size={16} />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded border border-border bg-input py-3 pl-10 pr-4 text-sm text-foreground outline-none ring-primary/30 transition focus:border-primary focus:ring-2"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded border border-accent/20 bg-accent/5 p-3 text-sm text-accent">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded bg-primary py-3 font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              <div className="scanner-line !h-full !w-full bg-white/10 opacity-0 group-hover:opacity-100" />
              {loading ? "VÉRIFICATION..." : "DÉVERROUILLER"}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <div className="mt-8 flex justify-center gap-4 text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/30">
            <span>Auth v1.0</span>
            <span>•</span>
            <span>Secure Terminal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
