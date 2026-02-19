"use client"

import * as React from "react"
import {
    Area,
    AreaChart,
    Bar,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { formatDateFr } from "@/lib/format"
import { useTheme } from "next-themes"

interface DailyTrendChartProps {
    data: Array<{
        date: string
        created: number
        scored: number
        contacted: number
        tasks_completed: number
    }>
}

export function DailyTrendChart({ data }: DailyTrendChartProps) {
    const { theme } = useTheme()
    const isDark = theme === "dark"

    if (!data || data.length === 0) return null

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#333" : "#eee"} />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatDateFr(value).split(" ")[0]}
                        tick={{ fontSize: 10 }}
                        stroke={isDark ? "#888" : "#666"}
                    />
                    <YAxis
                        yAxisId="left"
                        orientation="left"
                        stroke={isDark ? "#888" : "#666"}
                        tick={{ fontSize: 10 }}
                    />
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#10b981"
                        tick={{ fontSize: 10 }}
                    />
                    <Tooltip
                        labelFormatter={(value) => formatDateFr(value)}
                        contentStyle={{
                            backgroundColor: isDark ? "#1f2937" : "#fff",
                            borderColor: isDark ? "#374151" : "#e5e7eb",
                            fontSize: "12px"
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />

                    <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="created"
                        name="Leads Créés"
                        stroke="#6366f1"
                        fillOpacity={1}
                        fill="url(#colorCreated)"
                    />
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="scored"
                        name="Leads Scorés"
                        stroke="#f59e0b"
                        dot={false}
                    />
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="contacted"
                        name="Contactés"
                        stroke="#ec4899"
                        dot={false}
                    />
                    <Bar
                        yAxisId="right"
                        dataKey="tasks_completed"
                        name="Tâches Finies"
                        fill="#10b981"
                        opacity={0.6}
                        barSize={20}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )
}
