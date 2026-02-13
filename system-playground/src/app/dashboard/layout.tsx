"use client";

import { ReactNode } from "react";
import { Terminal, LayoutDashboard, Database, Activity, Beaker, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestApi } from "@/lib/api";

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await requestApi("/api/v1/admin/auth/logout", { method: "POST" });
            router.push("/");
        } catch {
            router.push("/");
        }
    };

    return (
        <div className="flex h-screen w-full bg-background overflow-hidden">
            {/* Sidebar */}
            <aside className="flex w-64 flex-col border-r border-border bg-background/50 backdrop-blur-md">
                <div className="flex h-16 items-center gap-3 border-b border-border px-6">
                    <Terminal size={24} className="text-primary" />
                    <span className="font-bold tracking-tighter text-foreground">PLAYGROUND</span>
                </div>

                <nav className="flex-1 space-y-1 p-4">
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 rounded px-3 py-2 text-sm font-medium text-foreground hover:bg-white/5 hover:text-primary transition-all group"
                    >
                        <LayoutDashboard size={18} className="text-foreground/50 group-hover:text-primary" />
                        Command Center
                    </Link>
                    <Link
                        href="/dashboard/injector"
                        className="flex items-center gap-3 rounded px-3 py-2 text-sm font-medium text-foreground hover:bg-white/5 hover:text-primary transition-all group"
                    >
                        <Database size={18} className="text-foreground/50 group-hover:text-primary" />
                        Manual Injector
                    </Link>
                    <Link
                        href="/dashboard/lab"
                        className="flex items-center gap-3 rounded px-3 py-2 text-sm font-medium text-foreground hover:bg-white/5 hover:text-primary transition-all group"
                    >
                        <Beaker size={18} className="text-foreground/50 group-hover:text-primary" />
                        Logic Lab
                    </Link>
                    <Link
                        href="/dashboard/status"
                        className="flex items-center gap-3 rounded px-3 py-2 text-sm font-medium text-foreground hover:bg-white/5 hover:text-primary transition-all group"
                    >
                        <Activity size={18} className="text-foreground/50 group-hover:text-primary" />
                        System Pulse
                    </Link>
                </nav>

                <div className="border-t border-border p-4">
                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-all"
                    >
                        <LogOut size={18} />
                        Déconnexion
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <header className="flex h-16 items-center justify-between border-b border-border bg-background/50 px-8 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/50">Terminal En Ligne</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-primary/70">ADMIN@PROSPECT-SYS-01</span>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-fixed opacity-[0.98]">
                    <div className="p-8">{children}</div>
                </main>
            </div>
        </div>
    );
}
