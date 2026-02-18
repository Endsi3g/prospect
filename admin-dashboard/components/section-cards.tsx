import { IconListCheck, IconUserPlus, IconUsers } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

interface Stats {
  total_leads: number
  new_leads_today: number
  qualified_leads: number
  hot_leads: number
  pending_tasks: number
  conversion_rate: number
}

export function SectionCards({ stats }: { stats?: Stats }) {
  const { messages } = useI18n()
  const safeStats = stats || {
    total_leads: 0,
    new_leads_today: 0,
    qualified_leads: 0,
    hot_leads: 0,
    pending_tasks: 0,
    conversion_rate: 0,
  }

  function formatPercent(value: number | undefined): string {
    if (value == null || Number.isNaN(value)) return "0%"
    return `${Math.round(value)}%`
  }

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <CardHeader>
          <CardDescription>{messages.dashboard.stats.sourcedLeads}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {safeStats.total_leads}
          </CardTitle>
          <CardAction>
            <IconUsers />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aujourd&apos;hui: +{safeStats.new_leads_today}
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <CardHeader>
          <CardDescription>{messages.dashboard.stats.qualifiedLeads}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {safeStats.qualified_leads}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUserPlus />
              {formatPercent((safeStats.qualified_leads / safeStats.total_leads) * 100)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Leads prioritaires
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <CardHeader>
          <CardDescription>Leads Chauds</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {safeStats.hot_leads}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconListCheck />
              Hot
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Score d&apos;engagement élevé
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs">
        <CardHeader>
          <CardDescription>Tâches en attente</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {safeStats.pending_tasks}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              {safeStats.conversion_rate}% conv.
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Actions à traiter
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
