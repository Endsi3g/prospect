"use client";

import { useState } from "react";
import { Database, Send, AlertCircle, CheckCircle2, FlaskConical } from "lucide-react";
import { requestApi } from "@/lib/api";

export default function ManualInjector() {
    const [payload, setPayload] = useState({
        first_name: "",
        last_name: "",
        email: "",
        company_name: "",
        industry: "Software",
        location: "Paris, France",
        details: '{\n  "admin_present": true,\n  "missing_essentials": false,\n  "tech_stack": ["React", "Python"]\n}'
    });

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleInject = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            // Parse details JSON
            let parsedDetails = {};
            try {
                parsedDetails = JSON.parse(payload.details);
            } catch {
                throw new Error("Détails JSON invalides");
            }

            const res = await requestApi("/api/v1/admin/leads", {
                method: "POST",
                body: JSON.stringify({
                    ...payload,
                    details: parsedDetails
                }),
            });

            setResult(res);
        } catch (err: any) {
            setError(err.message || "Erreur lors de l'injection");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">MANUAL <span className="text-primary">INJECTOR</span></h1>
                <p className="mt-1 text-sm text-foreground/50">Forcer l’insertion de données brutes dans le noyau du système.</p>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Form */}
                <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm">
                    <form onSubmit={handleInject} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-primary/70">Prénom</label>
                                <input
                                    type="text"
                                    value={payload.first_name}
                                    onChange={(e) => setPayload({ ...payload, first_name: e.target.value })}
                                    className="w-full rounded border border-border bg-input p-2 text-xs outline-none focus:border-primary"
                                    placeholder="Jean"
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-primary/70">Nom</label>
                                <input
                                    type="text"
                                    value={payload.last_name}
                                    onChange={(e) => setPayload({ ...payload, last_name: e.target.value })}
                                    className="w-full rounded border border-border bg-input p-2 text-xs outline-none focus:border-primary"
                                    placeholder="Dupont"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-primary/70">Email</label>
                            <input
                                type="email"
                                value={payload.email}
                                onChange={(e) => setPayload({ ...payload, email: e.target.value })}
                                className="w-full rounded border border-border bg-input p-2 text-xs outline-none focus:border-primary"
                                placeholder="jean.dupont@corp.com"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-primary/70">Entreprise</label>
                            <input
                                type="text"
                                value={payload.company_name}
                                onChange={(e) => setPayload({ ...payload, company_name: e.target.value })}
                                className="w-full rounded border border-border bg-input p-2 text-xs outline-none focus:border-primary"
                                placeholder="Acme Inc."
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-primary/70">Détails JSON (Comportement/Signaux)</label>
                            <textarea
                                value={payload.details}
                                onChange={(e) => setPayload({ ...payload, details: e.target.value })}
                                rows={6}
                                className="w-full rounded border border-border bg-input p-2 font-mono text-[10px] outline-none focus:border-primary"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded bg-primary py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                            {loading ? "INJECTION EN COURS..." : (
                                <><Send size={14} /> EXÉCUTER L&apos;INJECTION</>
                            )}
                        </button>
                    </form>
                </div>

                {/* Results / Feedback */}
                <div className="space-y-6">
                    <div className="rounded-lg border border-border bg-background/50 p-6 backdrop-blur-sm min-h-[200px]">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-primary mb-4 flex items-center gap-2">
                            <Activity className="w-3 h-3" /> Console de Sortie
                        </h2>

                        {loading && (
                            <div className="flex flex-col items-center justify-center h-32 text-foreground/30 animate-pulse">
                                <Database size={24} className="mb-2" />
                                <span className="text-[10px] font-mono tracking-widest">TRANSMISSION EN COURS...</span>
                            </div>
                        )}

                        {!loading && !result && !error && (
                            <div className="flex flex-col items-center justify-center h-32 text-foreground/20">
                                <FlaskConical size={24} className="mb-2" />
                                <span className="text-[10px] font-mono tracking-widest">EN ATTENTE DE COMMANDE</span>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-start gap-3 rounded border border-accent/20 bg-accent/5 p-4 text-accent">
                                <AlertCircle size={18} className="shrink-0" />
                                <div className="text-xs leading-relaxed">
                                    <span className="font-bold uppercase tracking-widest block mb-1">Erreur d&apos;Injection</span>
                                    {error}
                                </div>
                            </div>
                        )}

                        {result && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 rounded border border-emerald-500/20 bg-emerald-500/5 p-4 text-emerald-500">
                                    <CheckCircle2 size={18} className="shrink-0" />
                                    <div className="text-xs leading-relaxed lowercase font-mono">
                                        <span className="font-bold uppercase tracking-widest block mb-1">Succès: lead_{result.id}</span>
                                        Profil injecté avec succès dans la base de données.
                                    </div>
                                </div>

                                <div className="rounded border border-border bg-black/40 p-4">
                                    <span className="text-[10px] font-bold uppercase text-primary/70 block mb-2 tracking-widest">Métadonnées de Scoring</span>
                                    <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                                        <div className="text-foreground/50">ICP Score:</div>
                                        <div className="text-primary">{result.icp_score || 'N/A'}</div>
                                        <div className="text-foreground/50">Heat Score:</div>
                                        <div className="text-amber-500">{result.heat_score || 'N/A'}</div>
                                        <div className="text-foreground/50">Tier:</div>
                                        <div>{result.tier || 'N/A'}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Activity(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    )
}
