"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import { toIntlLocale, useI18n } from "@/lib/i18n"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

export const description = "Interactive pipeline area chart"

export type TrendPoint = {
  date: string
  created: number
  scored?: number
  contacted: number
  closed?: number
}

export interface ChartAreaInteractiveProps {
  trend?: TrendPoint[]
}

type TimeRange = "90d" | "30d" | "7d"

const RANGE_IN_DAYS: Record<TimeRange, number> = {
  "90d": 90,
  "30d": 30,
  "7d": 7,
}

function isTimeRange(value: string): value is TimeRange {
  return value === "90d" || value === "30d" || value === "7d"
}

export default function ChartAreaInteractive({ trend = [] }: ChartAreaInteractiveProps) {
  const { locale, messages } = useI18n()
  const localeTag = toIntlLocale(locale)
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState<TimeRange>("90d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const chartConfig = React.useMemo<ChartConfig>(
    () => ({
      desktop: {
        label: messages.dashboard.chart.seriesCreated,
        color: "var(--primary)",
      },
      mobile: {
        label: messages.dashboard.chart.seriesContacted,
        color: "var(--primary)",
      },
    }),
    [messages]
  )

  const runtimeChartData = React.useMemo(
    () =>
      trend
        .map((point) => ({
          date: point.date,
          desktop: point.created,
          mobile: point.contacted,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [trend]
  )

  const filteredData = React.useMemo(() => {
    if (runtimeChartData.length === 0) return []

    const latestDate = runtimeChartData[runtimeChartData.length - 1]?.date
    const referenceDate = latestDate ? new Date(latestDate) : new Date()
    const startDate = new Date(referenceDate)
    startDate.setDate(startDate.getDate() - RANGE_IN_DAYS[timeRange])

    return runtimeChartData.filter((item) => {
      const date = new Date(item.date)
      return date >= startDate
    })
  }, [runtimeChartData, timeRange])

  const periodLabel =
    timeRange === "90d"
      ? messages.dashboard.chart.range90d
      : timeRange === "30d"
        ? messages.dashboard.chart.range30d
        : messages.dashboard.chart.range7d

  const dateFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, {
        month: "short",
        day: "numeric",
      }),
    [localeTag]
  )

  const summaryText = React.useMemo(() => {
    if (filteredData.length === 0) {
      return `${messages.dashboard.chart.summaryPrefix}. ${messages.dashboard.chart.summaryEmpty}`
    }

    const totalCreated = filteredData.reduce((sum, item) => sum + item.desktop, 0)
    const totalContacted = filteredData.reduce((sum, item) => sum + item.mobile, 0)
    const minCreated = filteredData.reduce((min, item) => Math.min(min, item.desktop), Number.POSITIVE_INFINITY)
    const maxCreated = filteredData.reduce((max, item) => Math.max(max, item.desktop), Number.NEGATIVE_INFINITY)

    return [
      messages.dashboard.chart.summaryPrefix,
      `${messages.dashboard.chart.summaryPeriod}: ${periodLabel}`,
      `${messages.dashboard.chart.summaryCreatedTotal}: ${totalCreated}`,
      `${messages.dashboard.chart.summaryContactedTotal}: ${totalContacted}`,
      `${messages.dashboard.chart.summaryCreatedMin}: ${minCreated}`,
      `${messages.dashboard.chart.summaryCreatedMax}: ${maxCreated}`,
    ].join(". ")
  }, [filteredData, messages, periodLabel])

  const summaryId = React.useId()

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{messages.dashboard.chart.title}</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">{messages.dashboard.chart.subtitle}</span>
          <span className="@[540px]/card:hidden">{messages.dashboard.chart.subtitleShort}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => {
              if (isTimeRange(value)) {
                setTimeRange(value)
              }
            }}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">{messages.dashboard.chart.range90d}</ToggleGroupItem>
            <ToggleGroupItem value="30d">{messages.dashboard.chart.range30d}</ToggleGroupItem>
            <ToggleGroupItem value="7d">{messages.dashboard.chart.range7d}</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={timeRange}
            onValueChange={(value) => {
              if (isTimeRange(value)) {
                setTimeRange(value)
              }
            }}
          >
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label={messages.dashboard.chart.rangeSelectAriaLabel}
            >
              <SelectValue placeholder={messages.dashboard.chart.range90d} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                {messages.dashboard.chart.range90d}
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                {messages.dashboard.chart.range30d}
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                {messages.dashboard.chart.range7d}
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <div className="px-6 text-xs text-muted-foreground">{messages.dashboard.chart.legend}</div>
      <p id={summaryId} data-testid="chart-summary" className="sr-only">
        {messages.dashboard.chart.srDescription} {summaryText}
      </p>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {filteredData.length === 0 ? (
          <div
            className="flex h-[250px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
            aria-describedby={summaryId}
          >
            {messages.dashboard.chart.emptyState}
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
            role="img"
            aria-label={messages.dashboard.chart.title}
            aria-describedby={summaryId}
          >
            <AreaChart data={filteredData}>
              <defs>
                <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-desktop)"
                    stopOpacity={1.0}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-desktop)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-mobile)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-mobile)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => dateFormatter.format(new Date(value))}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => dateFormatter.format(new Date(value))}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="mobile"
                type="natural"
                fill="url(#fillMobile)"
                stroke="var(--color-mobile)"
                stackId="a"
              />
              <Area
                dataKey="desktop"
                type="natural"
                fill="url(#fillDesktop)"
                stroke="var(--color-desktop)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

