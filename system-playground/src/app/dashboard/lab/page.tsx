"use client";

import { useRef, useState } from "react";
import { Beaker, Brain, Play, RotateCcw, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { requestApi } from "@/lib/api";

export default function LogicLab() {
    const [activeSimulation, setActiveSimulation] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const simulations = [
        {
            id: "rescore_all",
            title: "Recalcul Globale (Scoring Engine)",
            description: "Force le recalcul de tous les scores (ICP/Heat) de la base de données.",
            icon: <RotateCcw size={18} />,
            endpoint: "/api/v1/admin/rescore",
            method: "POST"
        },
        {
            id: "ai_prospect",
            title: "Assistant Prospect (Khoj)",
            description: "Exécuter un prompt complexe via le moteur IA pour tester la planification.",
            icon: <Brain size={18} />,
            endpoint: "/api/v1/admin/assistant/prospect/execute",
            method: "POST",
            defaultPayload: { prompt: "Trouve 3 dentistes à Lyon et crée une tâche pour chacun.", max_leads: 3 }
        },
        {
            id: "diagnostic",
            title: "Intelligent Diagnostics",
            description: "Lancer le pipeline de détection d'anomalies sur les données.",
            icon: <Beaker size={18} />,
            endpoint: "/api/v1/admin/diagnostics/run",
            method: "POST"
        }
    ];

    const handleSimulate = async (sim: any) => {
        // Abort any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setActiveSimulation(sim.id);
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await requestApi(sim.endpoint, {
                method: sim.method,
                body: sim.defaultPayload ? JSON.stringify(sim.defaultPayload) : undefined,
                signal: controller.signal,
            });
            if (!controller.signal.aborted) {
                setResult(res);
            }
        } catch (err: any) {
            if (err.name === "AbortError") return;
            setError(err.message || "Erreur lors de la simulation");
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    };

    return (
        <div className="max-w-5xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">LOGIC <span className="text-primary">LAB</span></h1>
                <p className="mt-1 text-sm text-foreground/50">Environnement de simulation pour les algorithmes et l&apos;orchestration IA.</p>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Simulation Grid */}
                <div className="space-y-4">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-primary/70">Scénarios Disponibles</h2>
                    {simulations.map((sim) => (
                        <div
                            key={sim.id}
                            className={`relative overflow-hidden rounded-lg border transition-all p-5 ${activeSimulation === sim.id ? 'border-primary bg-primary/5' : 'border-border bg-background/50 hover:border-primary/30'}`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded ${activeSimulation === sim.id ? 'bg-primary text-primary-foreground' : 'bg-foreground/5 text-primary'}`}>
                                        {sim.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm">{sim.title}</h3>
                                        <p className="text-xs text-foreground/50 mt-1">{sim.description}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleSimulate(sim)}
                                    disabled={loading}
                                    aria-label={`Run ${sim.title}`}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-30"
                                >
                                    <Play size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Results / Details */}
                <div className="space-y-6">
                    <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm min-h-[300px]">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-6 flex items-center gap-2">
                            <Info className="w-3 h-3" /> État des Tests
                        </h2>

                        {!activeSimulation && (
                            <div className="flex flex-col items-center justify-center h-48 text-foreground/20 text-center">
                                <Beaker size={32} className="mb-4" />
                                <span className="text-[10px] font-mono tracking-widest uppercase">Sélectionnez un scénario pour démarrer le monitoring</span>
                            </div>
                        )}

                        {loading && (
                            <div className="space-y-4 animate-pulse">
                                <div className="h-4 w-3/4 bg-foreground/10 rounded" />
                                <div className="h-24 w-full bg-foreground/5 rounded" />
                                <div className="flex justify-center mt-8">
                                    <RotateCcw className="animate-spin text-primary" size={24} />
                                </div>
                            </div>
                        )}

                        {error && !loading && (
                            <div className="rounded border border-accent/20 bg-accent/5 p-4 flex items-start gap-3">
                                <AlertCircle className="text-accent shrink-0" size={18} />
                                <div className="text-xs">
                                    <span className="font-bold uppercase tracking-widest block mb-1">Défaut de Simulation</span>
                                    {error}
                                </div>
                            </div>
                        )}

                        {result && !loading && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 rounded border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-500">
                                    <CheckCircle2 size={18} className="shrink-0" />
                                    <div className="text-xs font-bold uppercase tracking-widest">
                                        Simulation Complétée
                                    </div>
                                </div>

                                <div className="rounded border border-border bg-black/40 p-4 overflow-hidden">
                                    <span className="text-[10px] font-bold uppercase text-primary/70 block mb-3 tracking-widest">Réponse Brute du Système</span>
                                    <pre className="text-[10px] font-mono text-foreground/70 overflow-x-auto">
                                        {JSON.stringify(result, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
