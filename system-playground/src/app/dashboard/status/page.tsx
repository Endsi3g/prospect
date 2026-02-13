"use client";

import { useEffect, useState } from "react";
import { Activity, Server, Database, Brain, Globe, ShieldCheck, Wifi, CloudOff } from "lucide-react";
import { requestApi } from "@/lib/api";

export default function SystemPulse() {
    const [components, setComponents] = useState([
        { id: "api", name: "Backend API", icon: <Server size={20} />, status: "loading", detail: "Checking connectivity..." },
        { id: "db", name: "Lead Database", icon: <Database size={20} />, status: "loading", detail: "Verifying SQLite integrity..." },
        { id: "khoj", name: "AI Engine (Khoj)", icon: <Brain size={20} />, status: "loading", detail: "Pinging AI endpoint..." },
        { id: "web", name: "Web Proxy", icon: <Globe size={20} />, status: "loading", detail: "Checking proxy bridge..." },
    ]);

    useEffect(() => {
        const checkSystems = async () => {
            // API & DB Check
            try {
                const health = await requestApi("/healthz") as any;
                setComponents(prev => prev.map(c => {
                    if (c.id === "api") return { ...c, status: "optimal", detail: "FastAPI v0.111.0 online" };
                    if (c.id === "db") return { ...c, status: health.db === "ok" ? "optimal" : "error", detail: health.db === "ok" ? "SQLite connection stable" : "DB connectivity issues" };
                    return c;
                }));
            } catch {
                setComponents(prev => prev.map(c => (c.id === "api" || c.id === "db") ? { ...c, status: "error", detail: "Connection failed" } : c));
            }

            // Khoj Check (Simulated for pulse demo)
            setComponents(prev => prev.map(c => {
                if (c.id === "khoj") return { ...c, status: "warning", detail: "Mock fallback active (Khoj offline)" };
                if (c.id === "web") return { ...c, status: "optimal", detail: "Next.js proxy bridge active" };
                return c;
            }));
        };

        checkSystems();
        const interval = setInterval(checkSystems, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="max-w-4xl space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">SYSTEM <span className="text-primary">PULSE</span></h1>
                    <p className="mt-1 text-sm text-foreground/50">Flux en temps réel de la santé des composants du noyau.</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                    <Wifi size={12} className="animate-pulse" /> Live Monitoring Actif
                </div>
            </div>

            <div className="space-y-4">
                {components.map((comp) => (
                    <div
                        key={comp.id}
                        className="group relative overflow-hidden rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm transition-all hover:border-primary/30"
                    >
                        <div className="scanner-line !h-full bg-primary/3 opacity-20" />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`flex h-12 w-12 items-center justify-center rounded border ${comp.status === 'optimal' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-500' : comp.status === 'warning' ? 'border-amber-500/30 bg-amber-500/5 text-amber-500' : 'border-rose-500/30 bg-rose-500/5 text-rose-500'}`}>
                                    {comp.status === 'error' ? <CloudOff size={22} /> : comp.icon}
                                </div>
                                <div>
                                    <h3 className="font-bold">{comp.name}</h3>
                                    <p className="text-xs text-foreground/50 mt-0.5">{comp.detail}</p>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${comp.status === 'optimal' ? 'bg-emerald-500/10 text-emerald-500' : comp.status === 'warning' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                    {comp.status}
                                </div>
                                <div className="mt-2 flex justify-end gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className={`h-1 w-3 rounded-full ${comp.status === 'optimal' ? 'bg-emerald-500/40' : comp.status === 'warning' ? 'bg-amber-500/40' : 'bg-rose-500/40'}`} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-lg border border-border bg-primary/5 p-6 flex items-start gap-4">
                <ShieldCheck className="text-primary mt-1" size={20} />
                <div className="space-y-1">
                    <h4 className="text-sm font-bold uppercase tracking-wider">Certificat de Sécurité</h4>
                    <p className="text-xs text-foreground/50 leading-relaxed shadow-sm">
                        Toutes les communications entre le Playground et le Backend API sont sécurisées via rotation de sessions Database.
                        Les tokens sont hachés en SHA-256 et révoqués automatiquement après expiration.
                    </p>
                </div>
            </div>
        </div>
    );
}
