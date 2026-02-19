"use client"

import * as React from "react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import { useTheme } from "next-themes"

interface ChannelChartProps {
    data: Array<{
        channel: string
        count: number
        completed: number
    }>
}

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"]

function channelLabel(channel: string): string {
    if (channel === "email") return "Email"
    if (channel === "linkedin") return "LinkedIn"
    if (channel === "call") return "Appel"
    return channel
}

export function ChannelChart({ data }: ChannelChartProps) {
    const { theme } = useTheme()
    const isDark = theme === "dark"

    const formattedData = React.useMemo(() => {
        return data.map(d => ({
            ...d,
            label: channelLabel(d.channel)
        }))
    }, [data])

    if (!data || data.length === 0) return null

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={formattedData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={isDark ? "#333" : "#eee"} />
                    <XAxis type="number" hide />
                    <YAxis
                        dataKey="label"
                        type="category"
                        width={80}
                        tick={{ fontSize: 11, fill: isDark ? "#aaa" : "#555" }}
                    />
                    <Tooltip
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{
                            backgroundColor: isDark ? "#1f2937" : "#fff",
                            borderColor: isDark ? "#374151" : "#e5e7eb",
                            fontSize: "12px"
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="count" name="Total Tâches" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                    <Bar dataKey="completed" name="Complétées" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
