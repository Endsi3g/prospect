"use client";

import { useEffect, useState } from "react";
import { Activity, Server, Database, Brain, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

export default function CommandCenter() {
    const [timestamp, setTimestamp] = useState("");

    useEffect(() => {
        const timer = setInterval(() => {
            setTimestamp(new Date().toISOString());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="space-y-8">
            {/* Header Stats */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                <PulseCard
                    label="API Latency"
                    value="24ms"
                    status="optimal"
                    icon={<Server size={20} />}
                />
                <PulseCard
                    label="DB Health"
                    value="Active"
                    status="optimal"
                    icon={<Database size={20} />}
                />
                <PulseCard
                    label="AI Engine (Khoj)"
                    value="Online"
                    status="optimal"
                    icon={<Brain size={20} />}
                />
                <PulseCard
                    label="System Load"
                    value="12%"
                    status="warning"
                    icon={<Activity size={20} />}
                />
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                {/* Real-time Logs / Activity */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-primary">Live Data Stream</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-foreground/30">{timestamp}</span>
                            </div>
                        </div>
                        <div className="h-64 space-y-2 overflow-y-auto font-mono text-[11px]">
                            <LogRow type="info" message="System initialized. Monitoring active ports." />
                            <LogRow type="success" message="Database connection verified: prospect.db" />
                            <LogRow type="info" message="CORS updated to permit port 3001." />
                            <LogRow type="warning" message="AI fallback active: Khoj endpoint unreachable." />
                            <LogRow type="info" message="Awaiting manual interaction..." />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="rounded-lg border border-border bg-background/50 p-6 flex flex-col justify-between group cursor-pointer hover:border-primary/50 transition-colors">
                            <div>
                                <h3 className="text-lg font-bold">Manual Injector</h3>
                                <p className="mt-2 text-sm text-foreground/50">Forcer l’insertion d’un profil complexe pour tester les règles de scoring.</p>
                            </div>
                            <div className="mt-4 flex items-center text-primary text-xs font-bold uppercase tracking-widest">
                                Ouvrir <ArrowUpRight size={14} className="ml-1" />
                            </div>
                        </div>
                        <div className="rounded-lg border border-border bg-background/50 p-6 flex flex-col justify-between group cursor-pointer hover:border-primary/50 transition-colors">
                            <div>
                                <h3 className="text-lg font-bold">Logic Lab</h3>
                                <p className="mt-2 text-sm text-foreground/50">Exécuter des simulations de nurturing et de relance IA en bac à sable.</p>
                            </div>
                            <div className="mt-4 flex items-center text-primary text-xs font-bold uppercase tracking-widest">
                                Ouvrir <ArrowUpRight size={14} className="ml-1" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Panel */}
                <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-primary mb-6">Security Context</h2>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-foreground/50">Auth Mode</span>
                            <span className="font-bold text-foreground">SESSION / DB</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-foreground/50">Token Rotation</span>
                            <span className="text-primary">ACTIF</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-foreground/50">Environment</span>
                            <span className="text-rose-500">DEVELOPMENT</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PulseCard({ label, value, status, icon }: any) {
    return (
        <div className="relative overflow-hidden rounded-lg border border-border bg-background/50 p-5 backdrop-blur-sm">
            <div className="scanner-line !h-full !w-full bg-primary/5 opacity-50" />
            <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded bg-foreground/5 text-primary">
                    {icon}
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">{label}</p>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-bold tracking-tight">{value}</span>
                        <div className={`h-1.5 w-1.5 rounded-full ${status === 'optimal' ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-amber-500 shadow-[0_0_6px_#f59e0b]'}`} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function LogRow({ type, message }: { type: 'info' | 'success' | 'warning', message: string }) {
    const colors = {
        info: 'text-primary/70',
        success: 'text-emerald-500/70',
        warning: 'text-amber-500/70'
    };

    return (
        <div className="flex gap-4">
            <span className={`w-12 shrink-0 font-bold uppercase tracking-tighter ${colors[type]}`}>[{type}]</span>
            <span className="text-foreground/70">{message}</span>
        </div>
    );
}
