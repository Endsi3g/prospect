/* eslint-disable @typescript-eslint/no-explicit-any */
type JsonObj = Record<string, unknown>
type MockScenario = "balanced" | "empty" | "ops_overload" | "conversion_peak"
type OpportunityStage = "Prospect" | "Qualified" | "Proposed" | "Won" | "Lost"

let seq = 2000
const nextId = (prefix: string) => `${prefix}-${++seq}`
const nowIso = () => new Date().toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString()

const SCENARIOS: MockScenario[] = ["balanced", "empty", "ops_overload", "conversion_peak"]
const MOCK_SCENARIO_STORAGE_KEY = "prospect:mockScenario"
const states: Partial<Record<MockScenario, any>> = {}

const FIRST_NAMES = ["Sophie", "Alex", "Maya", "Nicolas", "Emma", "Noah", "Lea", "Lucas", "Sarah", "Ethan", "Camille", "Hugo", "Ines", "Thomas", "Nora", "Leo", "Manon", "Antoine", "Lina", "Victor"]
const LAST_NAMES = ["Martin", "Roy", "Dubois", "Lefevre", "Bernard", "Petit", "Roux", "Moreau", "Andre", "Garnier", "Lopez", "Durand", "Richard", "Robert", "Lambert", "Faure"]
const INDUSTRIES = ["Medical", "Dental", "SaaS", "Fintech", "Retail", "Logistics", "Education"]
const LOCATIONS = ["Montreal, QC", "Lyon, FR", "Paris, FR", "Toronto, ON", "Austin, TX", "Berlin, DE", "Madrid, ES"]
const SEGMENTS = ["SMB", "General", "Enterprise", "Startup", "Mid-Market"]
const ASSIGNEES = ["Vous", "Alice SDR", "Camille Ops", "Jules Sales", "Nicolas AE"]
const OPPORTUNITY_STAGES: OpportunityStage[] = ["Prospect", "Qualified", "Proposed", "Won", "Lost"]
const OPPORTUNITY_STAGE_ORDER: Record<OpportunityStage, number> = { Prospect: 0, Qualified: 1, Proposed: 2, Won: 3, Lost: 4 }
const OPPORTUNITY_PROBABILITIES: Record<OpportunityStage, number> = { Prospect: 20, Qualified: 45, Proposed: 70, Won: 100, Lost: 0 }
const CANONICAL_STAGES = ["new", "enriched", "qualified", "contacted", "engaged", "opportunity", "won", "post_sale", "lost", "disqualified"] as const
const TERMINAL_CANONICAL_STAGE_SET = new Set<string>(["lost", "disqualified"])
const LEAD_STATUS_TO_CANONICAL: Record<string, string> = {
  NEW: "new",
  ENRICHED: "enriched",
  SCORED: "qualified",
  CONTACTED: "contacted",
  INTERESTED: "engaged",
  CONVERTED: "won",
  LOST: "lost",
  DISQUALIFIED: "disqualified",
}
const LEAD_CANONICAL_TO_STATUS: Record<string, string> = {
  new: "NEW",
  enriched: "ENRICHED",
  qualified: "SCORED",
  contacted: "CONTACTED",
  engaged: "INTERESTED",
  opportunity: "INTERESTED",
  won: "CONVERTED",
  post_sale: "CONVERTED",
  lost: "LOST",
  disqualified: "DISQUALIFIED",
}
const OPPORTUNITY_STAGE_TO_CANONICAL: Record<OpportunityStage, string> = {
  Prospect: "contacted",
  Qualified: "qualified",
  Proposed: "opportunity",
  Won: "won",
  Lost: "lost",
}
const CANONICAL_TO_OPPORTUNITY_STAGE: Record<string, OpportunityStage> = {
  new: "Prospect",
  enriched: "Prospect",
  contacted: "Prospect",
  qualified: "Qualified",
  engaged: "Qualified",
  opportunity: "Proposed",
  won: "Won",
  post_sale: "Won",
  lost: "Lost",
  disqualified: "Lost",
}
const STAGE_SLA_HOURS: Record<string, number> = {
  new: 24,
  enriched: 24,
  qualified: 24,
  contacted: 48,
  engaged: 48,
  opportunity: 72,
  won: 24,
  post_sale: 168,
  lost: 168,
  disqualified: 168,
}
const NEXT_ACTION_HOURS: Record<string, number> = {
  new: 4,
  enriched: 6,
  qualified: 8,
  contacted: 12,
  engaged: 12,
  opportunity: 18,
  won: 4,
  post_sale: 48,
  lost: 48,
  disqualified: 48,
}

const scenarioCount = (scenario: MockScenario) => {
  if (scenario === "empty") return { leads: 0, tasksPerLead: 0, projectModulo: 1000 }
  if (scenario === "ops_overload") return { leads: 72, tasksPerLead: 3, projectModulo: 2 }
  if (scenario === "conversion_peak") return { leads: 56, tasksPerLead: 2, projectModulo: 3 }
  return { leads: 44, tasksPerLead: 2, projectModulo: 4 }
}

const scoreTier = (score: number) => {
  if (score >= 85) return "Tier A"
  if (score >= 70) return "Tier B"
  if (score >= 50) return "Tier C"
  return "Tier D"
}

const heatStatus = (score: number) => {
  if (score >= 70) return "Hot"
  if (score >= 45) return "Warm"
  return "Cold"
}

const pick = <T,>(arr: T[], idx: number) => arr[idx % arr.length]

const leadStatus = (scenario: MockScenario, idx: number) => {
  const balanced = ["NEW", "SCORED", "CONTACTED", "INTERESTED", "CONVERTED", "LOST"]
  const ops = ["NEW", "NEW", "SCORED", "SCORED", "CONTACTED", "NEW", "INTERESTED", "LOST"]
  const peak = ["INTERESTED", "CONVERTED", "CONTACTED", "CONVERTED", "SCORED", "CONVERTED", "NEW", "INTERESTED"]
  const rows = scenario === "ops_overload" ? ops : scenario === "conversion_peak" ? peak : balanced
  return rows[idx % rows.length]
}

const taskStatus = (scenario: MockScenario, idx: number) => {
  const rows = scenario === "conversion_peak" ? ["Done", "Done", "In Progress", "To Do"] : scenario === "ops_overload" ? ["To Do", "To Do", "In Progress", "Done"] : ["To Do", "In Progress", "Done"]
  return rows[idx % rows.length]
}

const toIsoDate = (value: unknown): string => {
  const parsed = new Date(String(value || ""))
  if (!Number.isFinite(parsed.getTime())) return nowIso()
  return parsed.toISOString()
}

const addHoursIso = (value: unknown, hours: number): string => {
  const base = new Date(toIsoDate(value))
  return new Date(base.getTime() + hours * 3600000).toISOString()
}

const canonicalFromLeadStatus = (status: unknown): string => {
  const key = String(status || "").trim().toUpperCase()
  return LEAD_STATUS_TO_CANONICAL[key] || "new"
}

const canonicalFromOpportunityStage = (stage: unknown): string => {
  const normalized = normalizeOpportunityStage(stage)
  return OPPORTUNITY_STAGE_TO_CANONICAL[normalized] || "opportunity"
}

const opportunityStageFromCanonical = (stage: unknown): OpportunityStage => {
  const key = String(stage || "").trim().toLowerCase()
  return CANONICAL_TO_OPPORTUNITY_STAGE[key] || "Prospect"
}

const opportunityStatusFromCanonical = (stage: unknown): string => {
  const key = String(stage || "").trim().toLowerCase()
  if (key === "won" || key === "post_sale") return "won"
  if (key === "lost" || key === "disqualified") return "lost"
  return "open"
}

const makeStageDeadlines = (stage: string, at: unknown) => {
  const normalized = String(stage || "new").trim().toLowerCase()
  return {
    sla_due_at: addHoursIso(at, STAGE_SLA_HOURS[normalized] ?? 24),
    next_action_at: addHoursIso(at, NEXT_ACTION_HOURS[normalized] ?? 8),
  }
}

function scenarioFrom(url: URL): MockScenario {
  const fromPath = String(url.searchParams.get("mockScenario") || url.searchParams.get("mock_scenario") || "").trim().toLowerCase()
  if (SCENARIOS.includes(fromPath as MockScenario)) return fromPath as MockScenario
  if (typeof window !== "undefined") {
    try {
      const fromStorage = String(window.localStorage.getItem(MOCK_SCENARIO_STORAGE_KEY) || "").trim().toLowerCase()
      if (SCENARIOS.includes(fromStorage as MockScenario)) return fromStorage as MockScenario
    } catch {
      // ignore storage access errors
    }
    const params = new URLSearchParams(window.location.search)
    const fromWindow = String(params.get("mockScenario") || params.get("mock_scenario") || "").trim().toLowerCase()
    if (SCENARIOS.includes(fromWindow as MockScenario)) return fromWindow as MockScenario
  }
  const fromEnv = String(process.env.NEXT_PUBLIC_MOCK_SCENARIO_DEFAULT || "").trim().toLowerCase()
  if (SCENARIOS.includes(fromEnv as MockScenario)) return fromEnv as MockScenario
  return "balanced"
}

function makeState(scenario: MockScenario) {
  const cfg = scenarioCount(scenario)
  const leads: any[] = []
  const tasks: any[] = []
  const projects: any[] = []
  const opportunities: any[] = []
  for (let i = 0; i < cfg.leads; i += 1) {
    const first = pick(FIRST_NAMES, i)
    const last = pick(LAST_NAMES, i * 3 + 1)
    const company = `${first}${pick(["Flow", "Labs", "Systems", "Works", "Studio"], i)}`
    const domain = `${company.toLowerCase()}.com`
    const totalScore = Math.max(10, Math.min(98, (scenario === "ops_overload" ? 28 : scenario === "conversion_peak" ? 58 : 42) + ((i * 11) % 42)))
    const heat = Math.max(8, Math.min(96, totalScore + (scenario === "conversion_peak" ? 8 : scenario === "ops_overload" ? -6 : 0) + ((i % 7) - 3)))
    const status = leadStatus(scenario, i)
    const leadId = `lead-${scenario}-${String(i + 1).padStart(3, "0")}`
    const canonicalStage = canonicalFromLeadStatus(status)
    const stageEnteredAt = daysAgo((i % 12) + 1)
    const deadlines = makeStageDeadlines(canonicalStage, stageEnteredAt)
    leads.push({
      id: leadId,
      first_name: first,
      last_name: last,
      email: `${first}.${last}.${i + 1}@${domain}`.toLowerCase(),
      phone: i % 6 === 0 ? null : `+1 514 555 ${String(1000 + i).slice(-4)}`,
      linkedin_url: i % 4 === 0 ? null : `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${i + 1}`,
      company: { name: company, domain, industry: pick(INDUSTRIES, i), location: pick(LOCATIONS, i) },
      status,
      segment: pick(SEGMENTS, i),
      tags: [pick(INDUSTRIES, i).toLowerCase(), totalScore >= 75 ? "high_intent" : "nurture"],
      total_score: totalScore,
      score: {
        icp_score: Math.round(totalScore * 0.52),
        heat_score: heat,
        tier: scoreTier(totalScore),
        heat_status: heatStatus(heat),
        next_best_action: heat >= 70 ? "Call prioritaire + proposition" : "Email personnalise + relance J+2",
        icp_breakdown: { fit_size_match: Math.round(totalScore * 0.2), role_seniority: Math.round(totalScore * 0.16) },
        heat_breakdown: { intent_signal: Math.round(heat * 0.3), recency_signal: Math.round(heat * 0.2) },
        last_scored_at: daysAgo((i * 2) % 20),
      },
      created_at: daysAgo((i * 2) % 70 + 1),
      updated_at: daysAgo((i * 3) % 28),
      stage_canonical: canonicalStage,
      lead_owner_user_id: i % 6 === 0 ? null : i % 2 === 0 ? "user-1" : "user-2",
      stage_entered_at: stageEnteredAt,
      sla_due_at: i % 5 === 0 ? daysAgo(1) : deadlines.sla_due_at,
      next_action_at: i % 4 === 0 ? daysAgo(1) : deadlines.next_action_at,
      handoff_required: canonicalStage === "won",
      handoff_completed_at: canonicalStage === "won" && i % 3 === 0 ? daysAgo(1) : null,
    })
  }

  for (let i = 0; i < leads.length; i += 1) {
    for (let j = 0; j < cfg.tasksPerLead; j += 1) {
      const lead = leads[i]
      const channel = pick(["email", "linkedin", "call"], i + j)
      tasks.push({
        id: `task-${scenario}-${String(tasks.length + 1).padStart(4, "0")}`,
        title: `${channel === "call" ? "Appeler" : channel === "linkedin" ? "Suivre LinkedIn" : "Envoyer email"} ${lead.first_name} ${lead.last_name}`,
        description: `Execution de la tache ${channel} pour ${lead.first_name} ${lead.last_name}.`,
        status: taskStatus(scenario, i + j),
        priority: pick(["Low", "Medium", "High", "Critical"], i + j + (scenario === "ops_overload" ? 1 : 0)),
        due_date: daysFromNow(((i + j) % 14) - 4),
        assigned_to: scenario === "ops_overload" && (i + j) % 9 === 0 ? null : pick(ASSIGNEES, i + j),
        lead_id: lead.id,
        project_id: null,
        project_name: null,
        channel,
        sequence_step: (j % 4) + 1,
        source: pick(["manual", "auto-rule", "assistant"], i + j + 1),
        rule_id: (i + j) % 3 === 0 ? `rule-${(i + j) % 7}` : null,
        related_score_snapshot: { total_score: lead.total_score, tier: lead.score.tier },
        subtasks: [
          {
            id: `subtask-${scenario}-${i}-${j}-1`,
            title: "Verifier contexte lead",
            done: j % 3 === 0,
            created_at: daysAgo((i + j) % 18 + 2),
            updated_at: daysAgo((i + j) % 12 + 1),
          },
          {
            id: `subtask-${scenario}-${i}-${j}-2`,
            title: "Executer action de contact",
            done: false,
            created_at: daysAgo((i + j) % 18 + 2),
            updated_at: daysAgo((i + j) % 12 + 1),
          },
        ],
        comments: [],
        attachments: [],
        timeline: [
          {
            id: `timeline-${scenario}-${i}-${j}-created`,
            event_type: "task_created",
            message: "Tache creee.",
            actor: "system",
            created_at: daysAgo((i + j) % 20 + 1),
            metadata: {},
          },
        ],
        created_at: daysAgo((i + j) % 25 + 1),
        updated_at: daysAgo((i + j) % 12),
        closed_at: taskStatus(scenario, i + j) === "Done" ? daysAgo((i + j) % 8 + 1) : null,
      })
    }
    if (i % cfg.projectModulo === 0) {
      const projectId = `project-${scenario}-${String(projects.length + 1).padStart(3, "0")}`
      const projectBudget = 18000 + (i % 7) * 2500
      const projectSpent = Math.round(projectBudget * (((i % 5) + 1) / 10))
      projects.push({
        id: projectId,
        name: `${leads[i].company.name} - ${pick(["Onboarding", "Expansion", "Activation"], i)}`,
        description: `Projet ${pick(["Planning", "In Progress", "On Hold", "Completed"], i).toLowerCase()} pour ${leads[i].first_name} ${leads[i].last_name}`,
        status: pick(["Planning", "In Progress", "On Hold", "Completed", "Cancelled"], i),
        lead_id: leads[i].id,
        progress_percent: Math.max(0, Math.min(100, 20 + ((i * 7) % 70))),
        budget_total: projectBudget,
        budget_spent: projectSpent,
        team: [
          {
            id: `${projectId}-owner`,
            name: pick(ASSIGNEES, i),
            role: "Owner",
            contribution: 50,
          },
          {
            id: `${projectId}-ops`,
            name: pick(ASSIGNEES, i + 1),
            role: "Ops",
            contribution: 30,
          },
        ],
        timeline: [
          {
            id: `${projectId}-kickoff`,
            title: "Kickoff",
            start_date: daysAgo(10),
            end_date: daysAgo(9),
            milestone: true,
            depends_on: [],
          },
          {
            id: `${projectId}-delivery`,
            title: "Delivery",
            start_date: daysAgo(8),
            end_date: daysFromNow(7),
            milestone: false,
            depends_on: [`${projectId}-kickoff`],
          },
        ],
        deliverables: [
          {
            id: `${projectId}-d1`,
            title: "Deck de strategie",
            owner: pick(ASSIGNEES, i),
            due_date: daysFromNow(2),
            completed: i % 3 === 0,
          },
          {
            id: `${projectId}-d2`,
            title: "Rapport KPI",
            owner: pick(ASSIGNEES, i + 1),
            due_date: daysFromNow(9),
            completed: false,
          },
        ],
        due_date: daysFromNow((i % 35) - 5),
        created_at: daysAgo((i % 45) + 2),
        updated_at: daysAgo((i % 20) + 1),
      })
    }
  }

  for (const task of tasks) {
    const matchedProject = projects.find((project) => String(project.lead_id || "") === String(task.lead_id || ""))
    if (!matchedProject) continue
    task.project_id = matchedProject.id
    task.project_name = matchedProject.name
  }

  const stageSequence = scenario === "conversion_peak"
    ? (["Qualified", "Proposed", "Won", "Won", "Prospect", "Proposed"] as OpportunityStage[])
    : scenario === "ops_overload"
      ? (["Prospect", "Prospect", "Qualified", "Proposed", "Lost"] as OpportunityStage[])
      : (["Prospect", "Qualified", "Proposed", "Won", "Lost"] as OpportunityStage[])
  for (let i = 0; i < leads.length; i += 1) {
    if (scenario !== "empty" && i % 2 === 1) continue
    const lead = leads[i]
    const stage = pick(stageSequence, i)
    const amountBase = 1800 + ((i * 275) % 6200)
    const amount = scenario === "conversion_peak"
      ? amountBase + 1200
      : scenario === "ops_overload"
        ? Math.max(800, amountBase - 700)
        : amountBase
    const probability = OPPORTUNITY_PROBABILITIES[stage]
    const closeOffset = stage === "Won"
      ? -((i % 8) + 1)
      : stage === "Lost"
        ? -((i % 5) + 2)
        : ((i % 9) - 2)
    const createdAt = daysAgo((i % 30) + 2)
    const canonicalStage = canonicalFromOpportunityStage(stage)
    const deadlines = makeStageDeadlines(canonicalStage, createdAt)
    opportunities.push({
      id: `opp-${scenario}-${String(i + 1).padStart(3, "0")}`,
      lead_id: lead.id,
      name: `Opportunite - ${lead.company?.name || `${lead.first_name} ${lead.last_name}`}`,
      stage,
      amount,
      probability,
      assigned_to: pick(ASSIGNEES, i + 2),
      expected_close_date: daysFromNow(closeOffset),
      status: stage === "Won" ? "won" : stage === "Lost" ? "lost" : "open",
      owner_user_id: lead.lead_owner_user_id || "user-1",
      stage_canonical: canonicalStage,
      stage_entered_at: createdAt,
      sla_due_at: deadlines.sla_due_at,
      next_action_at: deadlines.next_action_at,
      handoff_required: canonicalStage === "won",
      handoff_completed_at: canonicalStage === "won" && i % 4 === 0 ? daysAgo(1) : null,
      created_at: createdAt,
      updated_at: createdAt,
    })
  }

  const notifications = leads.slice(0, 4).map((lead, idx) => ({
    id: `notif-${idx + 1}`,
    event_key: "lead_created",
    title: `Nouveau lead: ${lead.first_name} ${lead.last_name}`,
    message: `${lead.company.name} ajoute dans le pipeline.`,
    channel: "in_app",
    is_read: idx % 2 === 1,
    created_at: lead.created_at,
    link_href: "/leads",
    entity_type: "lead",
    entity_id: lead.id,
  }))

  return {
    settings: {
      organization_name: "Prospect",
      locale: "fr-FR",
      timezone: "Europe/Paris",
      default_page_size: 25,
      dashboard_refresh_seconds: scenario === "ops_overload" ? 20 : 30,
      support_email: "support@example.com",
      theme: "system",
      default_refresh_mode: "polling",
      notifications: { email: true, in_app: true },
    },
    integrations: {
      providers: {
        duckduckgo: { enabled: true, config: { region: "us-en", safe_search: "moderate" } },
        perplexity: { enabled: scenario !== "empty", config: { model: "sonar" } },
        firecrawl: { enabled: false, config: { country: "us", lang: "en", formats: ["markdown"] } },
        slack: { enabled: false, config: { webhook: "" } },
        zapier: { enabled: false, config: { zap_id: "" } },
      },
    },
    webhooks: [{ id: "webhook-1", name: "Ops", url: "https://example.com/webhook", events: ["lead.created", "task.created"], enabled: true }],
    account: {
      full_name: "Admin Prospect",
      email: "admin@example.com",
      title: "Head of Growth",
      locale: "fr-FR",
      timezone: "Europe/Paris",
      preferences: { density: "comfortable", keyboard_shortcuts: true, start_page: "/dashboard" },
      updated_at: daysAgo(2),
    },
    roles: [
      { id: 1, key: "admin", label: "Administrateur" },
      { id: 2, key: "manager", label: "Manager" },
      { id: 3, key: "sales", label: "Commercial" },
    ],
    users: [
      { id: "user-1", email: "admin@example.com", display_name: "Admin Prospect", status: "active", roles: ["admin"] },
      { id: "user-2", email: "sales@example.com", display_name: "Sales Mock", status: "invited", roles: ["sales"] },
    ],
    leads,
    tasks,
    projects,
    opportunities,
    notifications,
    notification_preferences: {
      channels: {
        in_app: { lead_created: true, task_created: true, report_ready: true, assistant_run_completed: true, task_due_soon: true },
        email: { lead_created: false, task_created: false, report_ready: true, assistant_run_completed: false, task_due_soon: false },
      },
    },
    billing: {
      profile: {
        plan_name: scenario === "conversion_peak" ? "Growth Plus" : "Business",
        billing_cycle: "monthly",
        status: scenario === "ops_overload" ? "past_due" : "active",
        currency: "EUR",
        amount_cents: scenario === "conversion_peak" ? 14900 : 9900,
        company_name: "Prospect SAS",
        billing_email: "billing@example.com",
        vat_number: "FR123456789",
        address_line: "10 Rue de la Mock",
        city: "Paris",
        postal_code: "75010",
        country: "France",
        notes: `Scenario ${scenario}`,
        updated_at: daysAgo(7),
      },
      invoices: [],
    },
    report_schedules: [],
    report_runs: [],
    campaigns: [
      {
        id: "campaign-1",
        name: "Nurture Q1",
        description: "Campagne mock active",
        status: "active",
        sequence_id: "sequence-1",
        channel_strategy: { primary: "email" },
        enrollment_filter: { statuses: ["NEW", "SCORED", "CONTACTED"] },
        created_at: daysAgo(12),
        updated_at: daysAgo(1),
      },
    ],
    campaign_runs: [],
    sequences: [
      {
        id: "sequence-1",
        name: "Warm lead 3-step",
        description: "Sequence mock par defaut",
        status: "active",
        channels: ["email", "call", "linkedin"],
        steps: [
          { step: 1, channel: "email", template_key: "initial_outreach", delay_days: 0, conditions: {} },
          { step: 2, channel: "linkedin", template_key: "follow_linkedin", delay_days: 2, conditions: { min_heat_score: 20 } },
          { step: 3, channel: "call", template_key: "follow_up_call", delay_days: 3, conditions: { min_heat_score: 30 } },
        ],
        created_at: daysAgo(10),
        updated_at: daysAgo(2),
      },
    ],
    funnel_config: {
      stages: Array.from(CANONICAL_STAGES),
      terminal_stages: Array.from(TERMINAL_CANONICAL_STAGE_SET),
      stage_sla_hours: { ...STAGE_SLA_HOURS },
      next_action_hours: { ...NEXT_ACTION_HOURS },
      model: "canonical_v1",
    },
    stage_events: [],
    smart_recommendations: [],
    lead_notes: {},
    content_generations: [],
    enrichment_jobs: [],
    assistant_runs: [],
    _scenario: scenario,
  }
}

function stateFor(url: URL) {
  const scenario = scenarioFrom(url)
  if (!states[scenario]) states[scenario] = makeState(scenario)
  return states[scenario] as any
}

const sleep = () => new Promise((resolve) => setTimeout(resolve, 120))
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const methodOf = (init?: RequestInit) => (init?.method || "GET").toUpperCase()
const toUrl = (path: string) => new URL(path, "http://localhost")
const bodyOf = (init?: RequestInit): JsonObj => {
  const body = init?.body
  if (!body) return {}
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as JsonObj
    } catch {
      return {}
    }
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const out: JsonObj = {}
    body.forEach((v, k) => { out[k] = typeof v === "string" ? v : v.name })
    return out
  }
  return {}
}

const asLeadList = (lead: any) => ({
  id: lead.id,
  email: lead.email,
  first_name: lead.first_name,
  last_name: lead.last_name,
  phone: lead.phone,
  linkedin_url: lead.linkedin_url,
  company_name: lead.company?.name || "",
  company_industry: lead.company?.industry || "",
  company_location: lead.company?.location || "",
  status: lead.status,
  segment: lead.segment,
  tier: lead.score?.tier || "Tier C",
  heat_status: lead.score?.heat_status || "Cold",
  tags: lead.tags || [],
  total_score: lead.total_score || 0,
})

const stats = (state: any) => {
  const leads = state.leads as any[]
  const sourced = leads.length
  const qualified = leads.filter((l) => Number(l.total_score || 0) >= 65).length
  const contacted = leads.filter((l) => ["CONTACTED", "INTERESTED", "CONVERTED"].includes(String(l.status))).length
  const replied = leads.filter((l) => ["INTERESTED", "CONVERTED"].includes(String(l.status))).length
  const closed = leads.filter((l) => l.status === "CONVERTED").length
  return {
    sourced_total: sourced,
    qualified_total: qualified,
    contacted_total: contacted,
    replied_total: replied,
    booked_total: Math.max(0, replied - 1),
    closed_total: closed,
    qualified_rate: sourced ? (qualified / sourced) * 100 : 0,
    contact_rate: sourced ? (contacted / sourced) * 100 : 0,
    reply_rate: contacted ? (replied / contacted) * 100 : 0,
    book_rate: replied ? ((replied - 1) / replied) * 100 : 0,
    close_rate: qualified ? (closed / qualified) * 100 : 0,
    avg_total_score: sourced ? leads.reduce((a, b) => a + Number(b.total_score || 0), 0) / sourced : 0,
    tier_distribution: leads.reduce((acc: Record<string, number>, lead) => {
      const tier = String(lead.score?.tier || "Tier C")
      acc[tier] = (acc[tier] || 0) + 1
      return acc
    }, {}),
    daily_pipeline_trend: Array.from({ length: 14 }).map((_, i) => {
      const day = new Date(Date.now() - (13 - i) * 86400000)
      const key = day.toISOString().slice(0, 10)
      const createdToDate = leads.filter((l) => String(l.created_at || "").slice(0, 10) <= key)
      return {
        date: key,
        sourced: createdToDate.length,
        qualified: createdToDate.filter((l) => Number(l.total_score || 0) >= 65).length,
        contacted: createdToDate.filter((l) => ["CONTACTED", "INTERESTED", "CONVERTED"].includes(String(l.status))).length,
        closed: createdToDate.filter((l) => String(l.status) === "CONVERTED").length,
      }
    }),
  }
}

const normalizeOpportunityStage = (raw: unknown): OpportunityStage => {
  const value = String(raw || "").trim().toLowerCase()
  if (value === "prospect" || value === "qualification") return "Prospect"
  if (value === "qualified" || value === "discovery") return "Qualified"
  if (value === "proposed" || value === "proposal" || value === "negotiation") return "Proposed"
  if (value === "won") return "Won"
  if (value === "lost") return "Lost"
  return "Prospect"
}

const opportunityProspectName = (lead: any) => {
  if (!lead) return "Prospect inconnu"
  const fullName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
  return fullName || String(lead.email || "Prospect")
}

const seedOpportunitiesFromLeads = (state: any) => {
  const leads = Array.isArray(state.leads) ? state.leads : []
  const seeded = leads
    .filter((_: unknown, index: number) => index % 2 === 0)
    .map((lead: any, index: number) => {
      const stage = pick(OPPORTUNITY_STAGES, index)
      const createdAt = daysAgo((index % 24) + 1)
      const canonicalStage = canonicalFromOpportunityStage(stage)
      const deadlines = makeStageDeadlines(canonicalStage, createdAt)
      return {
        id: nextId("opp"),
        lead_id: String(lead.id),
        name: `Opportunite - ${lead.company?.name || opportunityProspectName(lead)}`,
        stage,
        amount: 1500 + ((index * 300) % 4500),
        probability: OPPORTUNITY_PROBABILITIES[stage],
        assigned_to: pick(ASSIGNEES, index),
        expected_close_date: daysFromNow((index % 10) - 2),
        status: stage === "Won" ? "won" : stage === "Lost" ? "lost" : "open",
        owner_user_id: lead.lead_owner_user_id || "user-1",
        stage_canonical: canonicalStage,
        stage_entered_at: createdAt,
        sla_due_at: deadlines.sla_due_at,
        next_action_at: deadlines.next_action_at,
        handoff_required: canonicalStage === "won",
        handoff_completed_at: canonicalStage === "won" && index % 3 === 0 ? daysAgo(1) : null,
        created_at: createdAt,
        updated_at: createdAt,
      }
    })
  state.opportunities = seeded
  return seeded
}

const ensureOpportunities = (state: any): any[] => {
  if (!Array.isArray(state.opportunities)) return seedOpportunitiesFromLeads(state)
  return state.opportunities
}

const stageStatus = (stage: OpportunityStage) => (stage === "Won" ? "won" : stage === "Lost" ? "lost" : "open")

const buildOpportunityItem = (state: any, row: any) => {
  const leads = Array.isArray(state.leads) ? state.leads : []
  const lead = leads.find((item: any) => String(item.id) === String(row.lead_id || ""))
  const stage = normalizeOpportunityStage(row.stage)
  const closeDate = row.expected_close_date ? String(row.expected_close_date) : null
  const createdAt = row.created_at ? String(row.created_at) : null
  const updatedAt = row.updated_at ? String(row.updated_at) : null
  const prospectName = lead ? opportunityProspectName(lead) : String(row.name || "Prospect")
  const stageCanonical = String(row.stage_canonical || canonicalFromOpportunityStage(stage))
  const timestamp = closeDate ? Date.parse(closeDate) : Number.NaN
  const isOverdue = Number.isFinite(timestamp) && timestamp < Date.now()
  return {
    id: String(row.id),
    prospect_id: lead ? String(lead.id) : String(row.lead_id || ""),
    prospect_name: prospectName,
    amount: Number(row.amount || 0),
    stage,
    stage_canonical: stageCanonical,
    probability: Math.max(0, Math.min(100, Number(row.probability || 0))),
    assigned_to: String(row.assigned_to || "Vous"),
    owner_user_id: row.owner_user_id ? String(row.owner_user_id) : null,
    close_date: closeDate,
    next_action_at: row.next_action_at ? String(row.next_action_at) : null,
    sla_due_at: row.sla_due_at ? String(row.sla_due_at) : null,
    created_at: createdAt,
    updated_at: updatedAt,
    is_overdue: isOverdue,
    prospect: lead
      ? {
        id: String(lead.id),
        name: prospectName,
        email: String(lead.email || ""),
        company_name: String(lead.company?.name || ""),
      }
      : null,
  }
}

const dateValueFromOpportunity = (row: any, dateField: string) => {
  if (dateField === "created") return row.created_at ? Date.parse(String(row.created_at)) : Number.NaN
  const raw = row.expected_close_date ?? row.close_date
  return raw ? Date.parse(String(raw)) : Number.NaN
}

const filterOpportunities = (state: any, url: URL) => {
  const source = ensureOpportunities(state)
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase()
  const statusRaw = url.searchParams.get("status")
  const status = statusRaw && statusRaw !== "ALL" ? normalizeOpportunityStage(statusRaw) : null
  const assigned = String(url.searchParams.get("assigned_to") || "").trim()
  const amountMin = url.searchParams.get("amount_min")
  const amountMax = url.searchParams.get("amount_max")
  const min = amountMin === null || amountMin.trim() === "" ? Number.NEGATIVE_INFINITY : Number(amountMin)
  const max = amountMax === null || amountMax.trim() === "" ? Number.POSITIVE_INFINITY : Number(amountMax)
  const dateField = String(url.searchParams.get("date_field") || "close").trim().toLowerCase() === "created" ? "created" : "close"
  const dateFrom = parseDate(url.searchParams.get("date_from"))
  const dateToBase = parseDate(url.searchParams.get("date_to"))
  const dateTo = dateToBase === null ? null : dateToBase + 86399999

  let rows = source.filter((row: any) => {
    const lead = (state.leads as any[]).find((item) => String(item.id) === String(row.lead_id || ""))
    const stage = normalizeOpportunityStage(row.stage)
    if (status && stage !== status) return false
    if (assigned && String(row.assigned_to || "Vous") !== assigned) return false
    const amount = Number(row.amount || 0)
    if (Number.isFinite(min) && amount < min) return false
    if (Number.isFinite(max) && amount > max) return false
    const at = dateValueFromOpportunity(row, dateField)
    if (dateFrom !== null && (!Number.isFinite(at) || at < dateFrom)) return false
    if (dateTo !== null && (!Number.isFinite(at) || at > dateTo)) return false
    if (!q) return true
    const content = [
      row.name,
      lead ? opportunityProspectName(lead) : "",
      lead?.email || "",
      row.assigned_to || "",
      stage,
    ].join(" ").toLowerCase()
    return content.includes(q)
  })

  const sort = String(url.searchParams.get("sort") || "created_at").trim().toLowerCase()
  const order = String(url.searchParams.get("order") || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc"
  const sortValue = (row: any) => {
    const lead = (state.leads as any[]).find((item) => String(item.id) === String(row.lead_id || ""))
    if (sort === "amount") return Number(row.amount || 0)
    if (sort === "probability") return Number(row.probability || 0)
    if (sort === "stage") return OPPORTUNITY_STAGE_ORDER[normalizeOpportunityStage(row.stage)]
    if (sort === "assigned_to") return String(row.assigned_to || "")
    if (sort === "prospect_name") return lead ? opportunityProspectName(lead) : String(row.name || "")
    if (sort === "close_date") return row.expected_close_date ? Date.parse(String(row.expected_close_date)) : Number.NaN
    return row.created_at ? Date.parse(String(row.created_at)) : Number.NaN
  }
  rows = rows.slice().sort((a, b) => {
    const compare = cmp(sortValue(a), sortValue(b))
    return order === "asc" ? compare : -compare
  })
  return rows
}

const opportunitiesSummaryPayload = (state: any, rows: any[]) => {
  const normalizedRows = rows.map((row) => ({
    amount: Number(row.amount || 0),
    probability: Math.max(0, Math.min(100, Number(row.probability || 0))),
    stage: normalizeOpportunityStage(row.stage),
    close_date: row.expected_close_date ? String(row.expected_close_date) : null,
  }))
  const totalCount = normalizedRows.length
  const totalAmount = normalizedRows.reduce((acc, row) => acc + row.amount, 0)
  const wonCount = normalizedRows.filter((row) => row.stage === "Won").length
  const lostCount = normalizedRows.filter((row) => row.stage === "Lost").length
  const closedCount = wonCount + lostCount
  const forecastBuckets: Record<string, { month: string; expected_revenue: number; weighted_revenue: number; count: number }> = {}

  for (const row of normalizedRows) {
    if (!row.close_date) continue
    const parsed = Date.parse(row.close_date)
    if (!Number.isFinite(parsed)) continue
    const month = row.close_date.slice(0, 7)
    const bucket = forecastBuckets[month] || { month, expected_revenue: 0, weighted_revenue: 0, count: 0 }
    bucket.expected_revenue += row.amount
    bucket.weighted_revenue += row.amount * (row.probability / 100)
    bucket.count += 1
    forecastBuckets[month] = bucket
  }

  return {
    pipeline_value_total: Number(totalAmount.toFixed(2)),
    win_rate_percent: Number((closedCount > 0 ? (wonCount / closedCount) * 100 : 0).toFixed(2)),
    avg_deal_size: Number((totalCount > 0 ? totalAmount / totalCount : 0).toFixed(2)),
    close_rate_percent: Number((totalCount > 0 ? (closedCount / totalCount) * 100 : 0).toFixed(2)),
    forecast_monthly: Object.keys(forecastBuckets)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({
        month: key,
        expected_revenue: Number(forecastBuckets[key].expected_revenue.toFixed(2)),
        weighted_revenue: Number(forecastBuckets[key].weighted_revenue.toFixed(2)),
        count: forecastBuckets[key].count,
      })),
    without_close_date: normalizedRows.filter((row) => !row.close_date).length,
    total_count: totalCount,
    closed_count: closedCount,
    won_count: wonCount,
    lost_count: lostCount,
  }
}

const normalizeCanonicalStage = (raw: unknown): string => {
  const value = String(raw || "").trim().toLowerCase()
  if ((CANONICAL_STAGES as readonly string[]).includes(value)) return value
  return "new"
}

const leadCanonicalStage = (lead: any): string => {
  return normalizeCanonicalStage(lead.stage_canonical || canonicalFromLeadStatus(lead.status))
}

const ensureStageEvents = (state: any): any[] => {
  if (!Array.isArray(state.stage_events)) state.stage_events = []
  return state.stage_events
}

const createStageEvent = (
  state: any,
  payload: {
    entity_type: "lead" | "opportunity"
    entity_id: string
    from_stage: string | null
    to_stage: string
    reason?: string | null
    actor?: string
    source?: string
    metadata?: JsonObj
  },
) => {
  const event = {
    id: nextId("stage-event"),
    entity_type: payload.entity_type,
    entity_id: payload.entity_id,
    from_stage: payload.from_stage,
    to_stage: payload.to_stage,
    reason: payload.reason || null,
    actor: payload.actor || "admin",
    source: payload.source || "manual",
    metadata: payload.metadata || {},
    created_at: nowIso(),
  }
  ensureStageEvents(state).unshift(event)
  return event
}

const ensureLeadNotes = (state: any): Record<string, any[]> => {
  if (!state.lead_notes || typeof state.lead_notes !== "object") state.lead_notes = {}
  return state.lead_notes as Record<string, any[]>
}

const notesForLead = (state: any, leadId: string): any[] => {
  const map = ensureLeadNotes(state)
  if (!Array.isArray(map[leadId])) {
    map[leadId] = [
      {
        id: nextId("note"),
        content: "Note mock initiale pour suivi.",
        author: "admin",
        created_at: daysAgo(2),
        updated_at: daysAgo(1),
      },
    ]
  }
  return map[leadId]
}

const interactionsForLead = (state: any, leadId: string): any[] => {
  const tasks = (state.tasks as any[]).filter((task) => String(task.lead_id || "") === leadId).slice(0, 8)
  return tasks.map((task) => ({
    id: `interaction-${task.id}`,
    type: String(task.channel || "email"),
    timestamp: task.updated_at || task.created_at || nowIso(),
    details: {
      task_id: task.id,
      title: task.title,
      status: task.status,
      source: task.source || "manual",
    },
  }))
}

const ensureRecommendations = (state: any): any[] => {
  if (!Array.isArray(state.smart_recommendations)) state.smart_recommendations = []
  const recommendations = state.smart_recommendations as any[]
  const hasPending = (type: string, entityId: string) =>
    recommendations.some((item) => String(item.status) === "pending" && String(item.recommendation_type) === type && String(item.entity_id) === entityId)

  const leads = Array.isArray(state.leads) ? state.leads : []
  for (const lead of leads) {
    const canonical = leadCanonicalStage(lead)
    const slaDueTs = Date.parse(String(lead.sla_due_at || ""))
    if (!TERMINAL_CANONICAL_STAGE_SET.has(canonical) && Number.isFinite(slaDueTs) && slaDueTs < Date.now() && !hasPending("sla_followup", String(lead.id))) {
      recommendations.push({
        id: nextId("reco"),
        entity_type: "lead",
        entity_id: String(lead.id),
        recommendation_type: "sla_followup",
        priority: 90,
        payload: {
          title: "SLA depasse",
          lead_id: String(lead.id),
          stage_canonical: canonical,
          owner_user_id: lead.lead_owner_user_id || null,
        },
        status: "pending",
        requires_confirm: false,
        created_at: nowIso(),
        resolved_at: null,
      })
    }
    if (["qualified", "contacted", "engaged"].includes(canonical) && !lead.lead_owner_user_id && !hasPending("assign_owner", String(lead.id))) {
      recommendations.push({
        id: nextId("reco"),
        entity_type: "lead",
        entity_id: String(lead.id),
        recommendation_type: "assign_owner",
        priority: 80,
        payload: {
          title: "Assigner un owner",
          lead_id: String(lead.id),
          stage_canonical: canonical,
        },
        status: "pending",
        requires_confirm: true,
        created_at: nowIso(),
        resolved_at: null,
      })
    }
    if (canonical === "won" && lead.handoff_required && !lead.handoff_completed_at && !hasPending("create_handoff", String(lead.id))) {
      recommendations.push({
        id: nextId("reco"),
        entity_type: "lead",
        entity_id: String(lead.id),
        recommendation_type: "create_handoff",
        priority: 95,
        payload: {
          title: "Creer un handoff post-sale",
          lead_id: String(lead.id),
        },
        status: "pending",
        requires_confirm: true,
        created_at: nowIso(),
        resolved_at: null,
      })
    }
  }
  return recommendations
}

const funnelConfigForState = (state: any) => {
  if (!state.funnel_config || typeof state.funnel_config !== "object") {
    state.funnel_config = {
      stages: Array.from(CANONICAL_STAGES),
      terminal_stages: Array.from(TERMINAL_CANONICAL_STAGE_SET),
      stage_sla_hours: { ...STAGE_SLA_HOURS },
      next_action_hours: { ...NEXT_ACTION_HOURS },
      model: "canonical_v1",
    }
  }
  return state.funnel_config
}

const workloadOwnersPayload = (state: any) => {
  const users = Array.isArray(state.users) ? state.users : []
  const leads = Array.isArray(state.leads) ? state.leads : []
  const nowMs = Date.now()

  const items = users.map((user: any) => {
    const owned = leads.filter((lead: any) => String(lead.lead_owner_user_id || "") === String(user.id))
    const active = owned.filter((lead: any) => !TERMINAL_CANONICAL_STAGE_SET.has(leadCanonicalStage(lead)))
    const overdue = active.filter((lead: any) => {
      const ts = Date.parse(String(lead.sla_due_at || ""))
      return Number.isFinite(ts) && ts < nowMs
    })
    return {
      user_id: String(user.id),
      email: String(user.email),
      display_name: String((user.display_name || "").trim() || user.email),
      status: String(user.status || "active"),
      lead_count_total: owned.length,
      lead_count_active: active.length,
      overdue_sla_count: overdue.length,
    }
  })
  items.sort((a: any, b: any) => (b.overdue_sla_count - a.overdue_sla_count) || (b.lead_count_active - a.lead_count_active))

  const unassignedActiveLeads = leads.filter((lead: any) => !lead.lead_owner_user_id && !TERMINAL_CANONICAL_STAGE_SET.has(leadCanonicalStage(lead))).length
  return {
    generated_at: nowIso(),
    items,
    unassigned_active_leads: unassignedActiveLeads,
  }
}

const conversionFunnelPayload = (state: any, daysRaw: unknown) => {
  const days = Math.max(1, Math.min(365, Number(daysRaw || 30)))
  const to = new Date()
  const from = new Date(to.getTime() - days * 86400000)
  const leads = Array.isArray(state.leads) ? state.leads : []
  const events = ensureStageEvents(state)
  const currentCounts: Record<string, number> = {}
  for (const lead of leads) {
    const stage = leadCanonicalStage(lead)
    currentCounts[stage] = (currentCounts[stage] || 0) + 1
  }
  const eventCounts: Record<string, number> = {}
  for (const event of events) {
    const ts = Date.parse(String(event.created_at || ""))
    if (!Number.isFinite(ts) || ts < from.getTime()) continue
    const stage = normalizeCanonicalStage(event.to_stage)
    eventCounts[stage] = (eventCounts[stage] || 0) + 1
  }
  const stages = ["new", "enriched", "qualified", "contacted", "engaged", "opportunity", "won", "post_sale"]
  let previousStageCount: number | null = null
  const items = stages.map((stage) => {
    const count = Number(currentCounts[stage] || 0)
    const entries = Number(eventCounts[stage] || 0)
    const rate = previousStageCount === null ? (count > 0 ? 100 : 0) : (previousStageCount > 0 ? Number(((count / previousStageCount) * 100).toFixed(2)) : 0)
    previousStageCount = Math.max(1, count)
    return {
      stage,
      lead_count: count,
      entries_in_window: entries,
      conversion_from_previous_percent: rate,
    }
  })
  return {
    window_days: days,
    from: from.toISOString(),
    to: to.toISOString(),
    items,
    totals: {
      won: Number(currentCounts.won || 0),
      post_sale: Number(currentCounts.post_sale || 0),
      lost: Number(currentCounts.lost || 0),
      disqualified: Number(currentCounts.disqualified || 0),
    },
  }
}

const findUser = (state: any, payload: { id?: unknown; email?: unknown; display_name?: unknown }) => {
  const users = Array.isArray(state.users) ? state.users : []
  const id = String(payload.id || "").trim()
  if (id) {
    const byId = users.find((user: any) => String(user.id) === id)
    if (byId) return byId
  }
  const email = String(payload.email || "").trim().toLowerCase()
  if (email) {
    const byEmail = users.find((user: any) => String(user.email || "").trim().toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const displayName = String(payload.display_name || "").trim().toLowerCase()
  if (displayName) {
    const byDisplayName = users.find((user: any) => String(user.display_name || "").trim().toLowerCase() === displayName)
    if (byDisplayName) return byDisplayName
  }
  return null
}

const transitionLeadState = (
  state: any,
  lead: any,
  toStageRaw: unknown,
  reason: string | null,
  source: string,
  syncLegacy: boolean,
) => {
  const toStage = normalizeCanonicalStage(toStageRaw)
  const fromStage = leadCanonicalStage(lead)
  const enteredAt = nowIso()
  const deadlines = makeStageDeadlines(toStage, enteredAt)
  lead.stage_canonical = toStage
  lead.stage_entered_at = enteredAt
  lead.sla_due_at = deadlines.sla_due_at
  lead.next_action_at = deadlines.next_action_at
  lead.handoff_required = toStage === "won" || toStage === "post_sale"
  if (toStage === "post_sale") lead.handoff_completed_at = enteredAt
  if (syncLegacy) lead.status = LEAD_CANONICAL_TO_STATUS[toStage] || lead.status
  lead.updated_at = enteredAt
  const event = createStageEvent(state, {
    entity_type: "lead",
    entity_id: String(lead.id),
    from_stage: fromStage,
    to_stage: toStage,
    reason,
    source,
    metadata: { sync_legacy: syncLegacy },
  })
  return event
}

const transitionOpportunityState = (
  state: any,
  opportunity: any,
  toStageRaw: unknown,
  reason: string | null,
  source: string,
) => {
  const toStage = normalizeCanonicalStage(toStageRaw)
  const fromStage = normalizeCanonicalStage(opportunity.stage_canonical || canonicalFromOpportunityStage(opportunity.stage))
  const enteredAt = nowIso()
  const deadlines = makeStageDeadlines(toStage, enteredAt)
  opportunity.stage_canonical = toStage
  opportunity.stage = opportunityStageFromCanonical(toStage)
  opportunity.status = opportunityStatusFromCanonical(toStage)
  opportunity.stage_entered_at = enteredAt
  opportunity.sla_due_at = deadlines.sla_due_at
  opportunity.next_action_at = deadlines.next_action_at
  opportunity.handoff_required = toStage === "won" || toStage === "post_sale"
  if (toStage === "post_sale") opportunity.handoff_completed_at = enteredAt
  opportunity.updated_at = enteredAt
  const event = createStageEvent(state, {
    entity_type: "opportunity",
    entity_id: String(opportunity.id),
    from_stage: fromStage,
    to_stage: toStage,
    reason,
    source,
    metadata: {
      opportunity_stage: opportunity.stage,
      opportunity_status: opportunity.status,
    },
  })
  return event
}

const parseBool = (raw: string | null): boolean | null => {
  if (raw === null || raw === "") return null
  const v = raw.toLowerCase()
  if (v === "true" || v === "1" || v === "yes") return true
  if (v === "false" || v === "0" || v === "no") return false
  return null
}

const parseDate = (raw: string | null): number | null => {
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

const cmp = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b
  const aMs = typeof a === "string" ? Date.parse(a) : Number.NaN
  const bMs = typeof b === "string" ? Date.parse(b) : Number.NaN
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs - bMs
  return String(a ?? "").localeCompare(String(b ?? ""), "fr", { sensitivity: "base" })
}

function makeCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "id\n"
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const esc = (v: unknown) => {
    const s = String(v ?? "")
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) return `"${s.replaceAll("\"", "\"\"")}"`
    return s
  }
  return `${[headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n")}\n`
}

function notFound(path: string): never {
  throw new Error(`[MOCK] No mock data found for ${path}`)
}

function handleJson(path: string, init?: RequestInit): unknown {
  const url = toUrl(path)
  const pathname = url.pathname
  const method = methodOf(init)
  const body = bodyOf(init)
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const pageSize = Math.max(1, Number(url.searchParams.get("page_size") || 25))
  const state = stateFor(url)

  if (pathname === "/api/v1/admin/auth/login" && method === "POST") return { ok: true, username: String(body.username || "admin") }
  if (pathname === "/api/v1/admin/auth/signup" && method === "POST") return { ok: true, username: String(body.email || "demo@example.com") }
  if (pathname === "/api/v1/admin/auth/refresh" && method === "POST") return { ok: true }
  if (pathname === "/api/v1/admin/stats" && method === "GET") return stats(state)
  if (pathname === "/api/v1/admin/analytics" && method === "GET") {
    const leadsByStatus = (state.leads as any[]).reduce((acc: Record<string, number>, lead) => {
      const key = String(lead.status || "UNKNOWN")
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const doneTasks = (state.tasks as any[]).filter((task) => String(task.status) === "Done").length
    const totalTasks = (state.tasks as any[]).length || 1
    return {
      total_leads: state.leads.length,
      leads_by_status: leadsByStatus,
      task_completion_rate: (doneTasks / totalTasks) * 100,
      pipeline_value: (state.leads as any[]).reduce((acc, lead) => acc + Number(lead.total_score || 0) * 1400, 0),
      new_leads_today: (state.leads as any[]).filter((lead) => String(lead.created_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    }
  }
  if (pathname === "/api/v1/admin/settings") {
    if (method === "GET") return clone(state.settings)
    state.settings = { ...state.settings, ...(body as JsonObj), notifications: { ...state.settings.notifications, ...((body.notifications as JsonObj) || {}) } }
    return clone(state.settings)
  }
  if (pathname === "/api/v1/admin/integrations") {
    if (method === "GET") return clone(state.integrations)
    state.integrations = { providers: { ...state.integrations.providers, ...((body.providers as JsonObj) || {}) } }
    return clone(state.integrations)
  }
  if (pathname === "/api/v1/admin/webhooks" && method === "GET") return { items: clone(state.webhooks) }
  if (pathname === "/api/v1/admin/webhooks" && method === "POST") {
    const created = {
      id: nextId("webhook"),
      name: String(body.name || "Webhook"),
      url: String(body.url || "https://example.com/webhook"),
      events: Array.isArray(body.events) ? (body.events as unknown[]).map((item) => String(item)) : ["lead.created"],
      enabled: body.enabled !== false,
    }
      ; (state.webhooks as any[]).unshift(created)
    return clone(created)
  }
  if (pathname.match(/^\/api\/v1\/admin\/webhooks\/[^/]+$/) && method === "DELETE") {
    const id = pathname.split("/").pop() || ""
    state.webhooks = (state.webhooks as any[]).filter((item) => String(item.id) !== id)
    return { ok: true, id }
  }
  if (pathname === "/api/v1/admin/account") {
    if (method === "GET") return clone(state.account)
    state.account = { ...state.account, ...(body as JsonObj), updated_at: nowIso(), preferences: { ...state.account.preferences, ...((body.preferences as JsonObj) || {}) } }
    return clone(state.account)
  }
  if (pathname === "/api/v1/admin/roles" && method === "GET") return { items: clone(state.roles) }
  if (pathname === "/api/v1/admin/users" && method === "GET") return { items: clone(state.users) }
  if (pathname === "/api/v1/admin/users/invite" && method === "POST") {
    const created = {
      id: nextId("user"),
      email: String(body.email || "new-user@example.com"),
      display_name: String(body.display_name || body.email || "Invite"),
      status: "invited",
      roles: Array.isArray(body.roles) ? (body.roles as unknown[]).map((item) => String(item)) : ["sales"],
    }
      ; (state.users as any[]).unshift(created)
    return clone(created)
  }
  if (pathname.match(/^\/api\/v1\/admin\/users\/[^/]+$/) && (method === "PATCH" || method === "PUT")) {
    const id = pathname.split("/").pop() || ""
    const row = (state.users as any[]).find((user) => String(user.id) === id)
    if (!row) throw new Error("Utilisateur introuvable")
    row.status = body.status ? String(body.status) : row.status
    row.roles = Array.isArray(body.roles) ? (body.roles as unknown[]).map((item) => String(item)) : row.roles
    row.display_name = body.display_name ? String(body.display_name) : row.display_name
    return clone(row)
  }
  if (pathname === "/api/v1/admin/funnel/config") {
    const current = funnelConfigForState(state)
    if (method === "GET") return clone(current)
    if (method === "PUT") {
      if (Array.isArray(body.stages)) current.stages = (body.stages as unknown[]).map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      if (Array.isArray(body.terminal_stages)) current.terminal_stages = (body.terminal_stages as unknown[]).map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      if (body.stage_sla_hours && typeof body.stage_sla_hours === "object") {
        const next: Record<string, number> = {}
        for (const [key, value] of Object.entries(body.stage_sla_hours as Record<string, unknown>)) {
          next[String(key)] = Math.max(0, Number(value || 0))
        }
        current.stage_sla_hours = next
      }
      if (body.next_action_hours && typeof body.next_action_hours === "object") {
        const next: Record<string, number> = {}
        for (const [key, value] of Object.entries(body.next_action_hours as Record<string, unknown>)) {
          next[String(key)] = Math.max(0, Number(value || 0))
        }
        current.next_action_hours = next
      }
      if (body.model != null) current.model = String(body.model || "canonical_v1")
      state.funnel_config = current
      return clone(current)
    }
  }
  if (pathname === "/api/v1/admin/workload/owners" && method === "GET") {
    return workloadOwnersPayload(state)
  }
  if (pathname === "/api/v1/admin/conversion/funnel" && method === "GET") {
    return conversionFunnelPayload(state, url.searchParams.get("days"))
  }
  if (pathname === "/api/v1/admin/recommendations" && method === "GET") {
    const statusFilter = String(url.searchParams.get("status") || "pending").trim().toLowerCase()
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 50)))
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0))
    const all = ensureRecommendations(state)
      .slice()
      .sort((a, b) => (Number(b.priority || 0) - Number(a.priority || 0)) || cmp(String(b.created_at || ""), String(a.created_at || "")))
    const filtered = statusFilter ? all.filter((item) => String(item.status || "").toLowerCase() === statusFilter) : all
    return { total: filtered.length, items: clone(filtered.slice(offset, offset + limit)) }
  }
  if (pathname.match(/^\/api\/v1\/admin\/recommendations\/[^/]+\/apply$/) && method === "POST") {
    const recommendationId = pathname.split("/")[5]
    const recommendation = ensureRecommendations(state).find((item) => String(item.id) === recommendationId)
    if (!recommendation) throw new Error("Recommendation introuvable")
    if (String(recommendation.status) !== "pending") return { recommendation: clone(recommendation), result: { applied: false, reason: `already_${recommendation.status}` } }

    const now = nowIso()
    let result: JsonObj = { applied: false }
    if (recommendation.recommendation_type === "assign_owner") {
      const lead = (state.leads as any[]).find((item) => String(item.id) === String(recommendation.entity_id))
      const owner = (state.users as any[]).find((item) => String(item.status) === "active") || (state.users as any[])[0]
      if (lead && owner) {
        lead.lead_owner_user_id = owner.id
        lead.updated_at = now
        result = { applied: true, owner_user_id: owner.id, owner_email: owner.email }
      }
    } else if (recommendation.recommendation_type === "sla_followup") {
      const lead = (state.leads as any[]).find((item) => String(item.id) === String(recommendation.entity_id))
      if (lead) {
        lead.next_action_at = now
        const ownerUser = lead.lead_owner_user_id ? (state.users as any[]).find((item) => String(item.id) === String(lead.lead_owner_user_id)) : null
        const assignedLabel = ownerUser ? String((ownerUser.display_name || "").trim() || ownerUser.email) : "Vous"
        const task = {
          id: nextId("task"),
          title: `Relance SLA - ${lead.email}`,
          description: "Tache creee depuis recommandation mock.",
          status: "To Do",
          priority: "High",
          due_date: daysFromNow(1),
          assigned_to: assignedLabel,
          lead_id: lead.id,
          project_id: null,
          project_name: null,
          channel: "email",
          sequence_step: 1,
          source: "auto-rule",
          rule_id: "reco-sla-followup",
          related_score_snapshot: { total_score: Number(lead.total_score || 0), tier: String(lead.score?.tier || "Tier C") },
          subtasks: [],
          comments: [],
          attachments: [],
          timeline: [],
          created_at: now,
          updated_at: now,
          closed_at: null,
        }
          ; (state.tasks as any[]).unshift(task)
        result = { applied: true, task_id: task.id }
      }
    } else if (recommendation.recommendation_type === "create_handoff") {
      const lead = (state.leads as any[]).find((item) => String(item.id) === String(recommendation.entity_id))
      if (lead) {
        lead.handoff_required = true
        lead.updated_at = now
        result = { applied: true, handoff_required: true }
      }
    }

    recommendation.status = "applied"
    recommendation.resolved_at = now
    recommendation.payload = { ...(recommendation.payload || {}), result, applied_by: "admin" }
    return { recommendation: clone(recommendation), result }
  }
  if (pathname.match(/^\/api\/v1\/admin\/recommendations\/[^/]+\/dismiss$/) && method === "POST") {
    const recommendationId = pathname.split("/")[5]
    const recommendation = ensureRecommendations(state).find((item) => String(item.id) === recommendationId)
    if (!recommendation) throw new Error("Recommendation introuvable")
    if (String(recommendation.status) !== "pending") return { recommendation: clone(recommendation) }
    recommendation.status = "dismissed"
    recommendation.resolved_at = nowIso()
    recommendation.payload = { ...(recommendation.payload || {}), dismissed_by: "admin" }
    return { recommendation: clone(recommendation) }
  }
  if (pathname === "/api/v1/admin/tasks/bulk-assign" && method === "POST") {
    const taskIds = Array.isArray(body.task_ids) ? (body.task_ids as unknown[]).map((item) => String(item).trim()).filter(Boolean) : []
    const assignedTo = String(body.assigned_to || "").trim()
    if (!assignedTo) throw new Error("assigned_to est requis")
    let updated = 0
    for (const task of state.tasks as any[]) {
      if (!taskIds.includes(String(task.id))) continue
      task.assigned_to = assignedTo
      task.updated_at = nowIso()
      updated += 1
    }
    return { updated, requested: taskIds.length, assigned_to: assignedTo, actor: "admin", reason: body.reason ? String(body.reason) : null }
  }

  if (pathname === "/api/v1/admin/opportunities" && method === "GET") {
    const rows = filterOpportunities(state, url)
    const total = rows.length
    const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)
    return { page, page_size: pageSize, total, items: pageRows.map((row) => buildOpportunityItem(state, row)) }
  }
  if (pathname === "/api/v1/admin/opportunities/summary" && method === "GET") {
    const rows = filterOpportunities(state, url)
    return opportunitiesSummaryPayload(state, rows)
  }
  if (pathname === "/api/v1/admin/opportunities" && method === "POST") {
    const leadId = String(body.prospect_id || "").trim()
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const stage = normalizeOpportunityStage(body.stage)
    const canonicalStage = canonicalFromOpportunityStage(stage)
    const createdAt = nowIso()
    const deadlines = makeStageDeadlines(canonicalStage, createdAt)
    const amount = Number(body.amount || 0)
    const probability = Math.max(0, Math.min(100, Number(body.probability || 0)))
    const created = {
      id: nextId("opp"),
      lead_id: lead.id,
      name: String(body.name || `Opportunite - ${opportunityProspectName(lead)}`),
      stage,
      amount: Number.isFinite(amount) ? amount : 0,
      probability: Number.isFinite(probability) ? probability : OPPORTUNITY_PROBABILITIES[stage],
      assigned_to: String(body.assigned_to || "Vous"),
      expected_close_date: body.close_date ? toIsoDate(body.close_date) : null,
      status: stageStatus(stage),
      owner_user_id: lead.lead_owner_user_id || "user-1",
      stage_canonical: canonicalStage,
      stage_entered_at: createdAt,
      sla_due_at: deadlines.sla_due_at,
      next_action_at: deadlines.next_action_at,
      handoff_required: canonicalStage === "won",
      handoff_completed_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    }
    ensureOpportunities(state).unshift(created)
    return buildOpportunityItem(state, created)
  }
  if (pathname === "/api/v1/admin/opportunities/quick-lead" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase()
    const firstName = String(body.first_name || "").trim()
    const lastName = String(body.last_name || "").trim()
    const companyName = String(body.company_name || "").trim()
    if (!email || !firstName || !lastName || !companyName) throw new Error("Champs prospect requis.")
    const existing = (state.leads as any[]).find((item) => String(item.email || "").toLowerCase() === email)
    if (existing) {
      const name = `${existing.first_name || ""} ${existing.last_name || ""}`.trim() || existing.email
      return { created: false, lead: { id: existing.id, name } }
    }
    const createdAt = nowIso()
    const canonicalStage = "new"
    const deadlines = makeStageDeadlines(canonicalStage, createdAt)
    const leadId = nextId("lead")
    const createdLead = {
      id: leadId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: null,
      linkedin_url: null,
      company: {
        name: companyName,
        domain: `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "company"}.com`,
        industry: "SaaS",
        location: "Paris, FR",
      },
      status: "NEW",
      segment: "General",
      tags: ["manual"],
      total_score: 42,
      score: {
        icp_score: 21,
        heat_score: 20,
        tier: "Tier C",
        heat_status: "Cold",
        next_best_action: "Qualification initiale",
        icp_breakdown: {},
        heat_breakdown: {},
        last_scored_at: createdAt,
      },
      created_at: createdAt,
      updated_at: createdAt,
      stage_canonical: canonicalStage,
      lead_owner_user_id: null,
      stage_entered_at: createdAt,
      sla_due_at: deadlines.sla_due_at,
      next_action_at: deadlines.next_action_at,
      handoff_required: false,
      handoff_completed_at: null,
    }
      ; (state.leads as any[]).unshift(createdLead)
    return { created: true, lead: { id: createdLead.id, name: `${firstName} ${lastName}`.trim() } }
  }
  if (pathname.match(/^\/api\/v1\/admin\/opportunities\/[^/]+$/) && method === "PATCH") {
    const opportunityId = pathname.split("/")[5]
    const row = ensureOpportunities(state).find((item) => String(item.id) === opportunityId)
    if (!row) throw new Error("Opportunity introuvable")
    if (body.prospect_id) {
      const lead = (state.leads as any[]).find((item) => String(item.id) === String(body.prospect_id))
      if (!lead) throw new Error("Lead introuvable")
      row.lead_id = lead.id
      row.owner_user_id = lead.lead_owner_user_id || row.owner_user_id
    }
    if (body.name != null) row.name = String(body.name || row.name)
    if (body.stage != null) {
      const stage = normalizeOpportunityStage(body.stage)
      row.stage = stage
      row.stage_canonical = canonicalFromOpportunityStage(stage)
      row.status = stageStatus(stage)
      row.stage_entered_at = nowIso()
      const deadlines = makeStageDeadlines(row.stage_canonical, row.stage_entered_at)
      row.sla_due_at = deadlines.sla_due_at
      row.next_action_at = deadlines.next_action_at
    }
    if (body.amount != null) row.amount = Math.max(0, Number(body.amount || 0))
    if (body.probability != null) row.probability = Math.max(0, Math.min(100, Number(body.probability || 0)))
    if (body.assigned_to != null) row.assigned_to = String(body.assigned_to || "Vous")
    if (body.close_date !== undefined) row.expected_close_date = body.close_date ? toIsoDate(body.close_date) : null
    row.updated_at = nowIso()
    return buildOpportunityItem(state, row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/opportunities\/[^/]+$/) && method === "DELETE") {
    const opportunityId = pathname.split("/")[5]
    state.opportunities = ensureOpportunities(state).filter((item) => String(item.id) !== opportunityId)
    return { deleted: true, id: opportunityId }
  }
  if (pathname.match(/^\/api\/v1\/admin\/opportunities\/[^/]+\/stage-transition$/) && method === "POST") {
    const opportunityId = pathname.split("/")[5]
    const row = ensureOpportunities(state).find((item) => String(item.id) === opportunityId)
    if (!row) throw new Error("Opportunity introuvable")
    const event = transitionOpportunityState(
      state,
      row,
      body.to_stage,
      body.reason ? String(body.reason) : null,
      body.source ? String(body.source) : "manual",
    )
    let leadEvent: any = null
    const toStage = String(event.to_stage || "").toLowerCase()
    if (toStage === "won" || toStage === "post_sale" || toStage === "lost" || toStage === "disqualified") {
      const lead = (state.leads as any[]).find((item) => String(item.id) === String(row.lead_id))
      if (lead) {
        leadEvent = transitionLeadState(
          state,
          lead,
          toStage,
          `Synced from opportunity ${opportunityId}`,
          "opportunity_sync",
          true,
        )
      }
    }
    return { opportunity: buildOpportunityItem(state, row), event, lead_event: leadEvent }
  }

  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/interactions$/) && method === "GET") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    return interactionsForLead(state, leadId)
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/opportunities$/) && method === "GET") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const rows = ensureOpportunities(state).filter((item) => String(item.lead_id) === leadId)
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name || `Opportunite - ${opportunityProspectName(lead)}`),
      stage: String(row.stage || "Prospect"),
      status: String(row.status || "open"),
      amount: Number(row.amount || 0),
      probability: Math.max(0, Math.min(100, Number(row.probability || 0))),
      updated_at: String(row.updated_at || row.created_at || nowIso()),
    }))
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/opportunities$/) && method === "POST") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const stage = normalizeOpportunityStage(body.stage)
    const canonicalStage = canonicalFromOpportunityStage(stage)
    const createdAt = nowIso()
    const deadlines = makeStageDeadlines(canonicalStage, createdAt)
    const created = {
      id: nextId("opp"),
      lead_id: leadId,
      name: String(body.name || `Opportunite - ${opportunityProspectName(lead)}`),
      stage,
      amount: Math.max(0, Number(body.amount || 0)),
      probability: Math.max(0, Math.min(100, Number(body.probability || OPPORTUNITY_PROBABILITIES[stage]))),
      assigned_to: "Vous",
      expected_close_date: body.expected_close_date ? toIsoDate(body.expected_close_date) : null,
      status: stageStatus(stage),
      owner_user_id: lead.lead_owner_user_id || "user-1",
      stage_canonical: canonicalStage,
      stage_entered_at: createdAt,
      sla_due_at: deadlines.sla_due_at,
      next_action_at: deadlines.next_action_at,
      handoff_required: canonicalStage === "won",
      handoff_completed_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    }
    ensureOpportunities(state).unshift(created)
    return {
      id: created.id,
      name: created.name,
      stage: created.stage,
      status: created.status,
      amount: created.amount,
      probability: created.probability,
      updated_at: created.updated_at,
    }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/notes$/) && method === "GET") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    return { items: clone(notesForLead(state, leadId)) }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/notes$/) && method === "PUT") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const items = Array.isArray(body.items)
      ? (body.items as unknown[]).map((item, index) => {
        const row = item as Record<string, unknown>
        const content = String(row.content || "").trim()
        return {
          id: row.id ? String(row.id) : `note-${leadId}-${index + 1}`,
          content,
          author: row.author ? String(row.author) : "admin",
          created_at: row.created_at ? toIsoDate(row.created_at) : nowIso(),
          updated_at: nowIso(),
        }
      }).filter((item) => item.content)
      : []
    ensureLeadNotes(state)[leadId] = items
    return { items: clone(items) }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/add-to-campaign$/) && method === "POST") {
    const leadId = pathname.split("/")[5]
    const campaignId = String(body.campaign_id || "").trim()
    if (!campaignId) throw new Error("campaign_id est requis")
    return { ok: true, lead_id: leadId, campaign_id: campaignId }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/stage-transition$/) && method === "POST") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const event = transitionLeadState(
      state,
      lead,
      body.to_stage,
      body.reason ? String(body.reason) : null,
      body.source ? String(body.source) : "manual",
      body.sync_legacy !== false,
    )
    return { lead: clone(lead), event }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/reassign$/) && method === "POST") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const user = findUser(state, {
      id: body.owner_user_id,
      email: body.owner_email,
      display_name: body.owner_display_name,
    })
    if (!user) throw new Error("Owner user not found")
    const previousOwner = lead.lead_owner_user_id || null
    lead.lead_owner_user_id = user.id
    lead.updated_at = nowIso()
    const event = createStageEvent(state, {
      entity_type: "lead",
      entity_id: leadId,
      from_stage: leadCanonicalStage(lead),
      to_stage: leadCanonicalStage(lead),
      reason: body.reason ? String(body.reason) : "owner_reassigned",
      source: "assignment",
      metadata: { from_owner_user_id: previousOwner, to_owner_user_id: user.id },
    })
    return {
      lead_id: leadId,
      owner_user_id: user.id,
      owner_email: user.email,
      previous_owner_user_id: previousOwner,
      event,
    }
  }
  if (pathname === "/api/v1/admin/handoffs" && method === "POST") {
    const leadId = body.lead_id ? String(body.lead_id) : ""
    const opportunityId = body.opportunity_id ? String(body.opportunity_id) : ""
    if (!leadId && !opportunityId) throw new Error("lead_id ou opportunity_id requis")
    const toUser = findUser(state, {
      id: body.to_user_id,
      email: body.to_user_email,
      display_name: body.to_user_display_name,
    })
    const note = body.note ? String(body.note) : null
    let entityType: "lead" | "opportunity" = "lead"
    let entityId = ""

    if (leadId) {
      const lead = (state.leads as any[]).find((item: any) => String(item.id) === leadId)
      if (!lead) throw new Error("Lead introuvable")
      lead.handoff_required = true
      lead.handoff_completed_at = nowIso()
      if (toUser) lead.lead_owner_user_id = toUser.id
      lead.updated_at = nowIso()
      entityType = "lead"
      entityId = lead.id
    }
    if (opportunityId) {
      const opportunity = ensureOpportunities(state).find((item) => String(item.id) === opportunityId)
      if (!opportunity) throw new Error("Opportunity introuvable")
      opportunity.handoff_required = true
      opportunity.handoff_completed_at = nowIso()
      if (toUser) opportunity.owner_user_id = toUser.id
      opportunity.updated_at = nowIso()
      entityType = "opportunity"
      entityId = opportunity.id
    }
    const event = createStageEvent(state, {
      entity_type: entityType,
      entity_id: entityId,
      from_stage: "won",
      to_stage: "post_sale",
      reason: "handoff_completed",
      source: "handoff",
      metadata: {
        note,
        to_user_id: toUser ? toUser.id : null,
        to_user_email: toUser ? toUser.email : null,
      },
    })
    return {
      entity_type: entityType,
      entity_id: entityId,
      to_user: toUser ? { id: toUser.id, email: toUser.email, display_name: toUser.display_name || null } : null,
      event,
    }
  }

  if (pathname === "/api/v1/admin/help" && method === "GET") {
    return {
      support_email: state.settings.support_email,
      faqs: [{ question: "Comment lancer ?", answer: "Allez dans Leads." }],
      links: [{ label: "Parametres", href: "/settings" }],
      sections: [
        {
          id: "guides",
          label: "Guides",
          items: [{ label: "Quickstart", href: "/help/guides/quickstart" }]
        }
      ],
      quick_actions: [
        { id: "docs", label: "Library", href: "/library", scope: "global" }
      ],
      updated_at: nowIso()
    }
  }

  if (pathname === "/api/v1/admin/secrets/schema" && method === "GET") {
    return {
      version: "v1",
      categories: [
        {
          id: "ai",
          label: "IA / NLP",
          keys: [
            { key: "OPENAI_API_KEY", description: "Clé OpenAI" },
            { key: "ANTHROPIC_API_KEY", description: "Clé Anthropic" }
          ]
        }
      ]
    }
  }

  if (pathname === "/api/v1/admin/secrets" && method === "GET") {
    return {
      items: [
        { key: "OPENAI_API_KEY", configured: true, source: "env", masked_value: "********", updated_at: nowIso() },
        { key: "ANTHROPIC_API_KEY", configured: false, source: "none", masked_value: "", updated_at: null }
      ]
    }
  }

  if (pathname === "/api/v1/admin/docs/compagnie" && method === "GET") {
    return {
      generated_at: nowIso(),
      stats: { total_files: 1, processed_pdf: 1, ingested: 0, failed: 0 },
      page: 1,
      page_size: 24,
      total: 1,
      items: [
        {
          doc_id: "mock-doc-1",
          title: "Document Mock.pdf",
          ext: ".pdf",
          status: "processed",
          size_bytes: 1024,
          updated_at: nowIso(),
          raw_path: "/raw/mock-doc-1.pdf",
          processed: { markdown_path: "/processed/mock-doc-1.md" }
        }
      ]
    }
  }

  if (pathname === "/api/v1/admin/diagnostics/latest" && method === "GET") return { available: false, artifact: "artifacts/qa/latest_diagnostics.json", detail: "No diagnostics artifact available yet.", status: "warning", finished_at: null }
  if (pathname === "/api/v1/admin/autofix/latest" && method === "GET") return { available: false, artifact: "artifacts/qa/latest_autofix.json", detail: "No autofix artifact available yet.", status: "warning", finished_at: null }
  if (pathname === "/api/v1/admin/diagnostics/run" && method === "POST") return { ok: true, return_code: 0, auto_fix: false, started_at: nowIso(), finished_at: nowIso(), duration_seconds: 0.02, artifact: "artifacts/qa/latest_diagnostics.json", stdout_tail: ["[mock] diagnostics completed"], stderr_tail: [], artifact_payload: { status: "ok", source: "mock" } }
  if (pathname === "/api/v1/admin/autofix/run" && method === "POST") return { ok: true, return_code: 0, auto_fix: true, started_at: nowIso(), finished_at: nowIso(), duration_seconds: 0.03, artifact: "artifacts/qa/latest_autofix.json", stdout_tail: ["[mock] autofix completed"], stderr_tail: [], artifact_payload: { status: "ok", source: "mock" } }
  if (pathname === "/api/v1/admin/audit-log" && method === "GET") return { items: [{ id: "audit-1", actor: "mock-system", action: "mock_boot", entity_type: "system", entity_id: null, created_at: nowIso() }], next_cursor: null }

  if (pathname === "/api/v1/admin/leads" && method === "GET") {
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase()
    const status = String(url.searchParams.get("status") || "").trim()
    const segment = String(url.searchParams.get("segment") || "").trim().toLowerCase()
    const tier = String(url.searchParams.get("tier") || "").trim()
    const heatStatus = String(url.searchParams.get("heat_status") || "").trim()
    const company = String(url.searchParams.get("company") || "").trim().toLowerCase()
    const industry = String(url.searchParams.get("industry") || "").trim().toLowerCase()
    const location = String(url.searchParams.get("location") || "").trim().toLowerCase()
    const tag = String(url.searchParams.get("tag") || "").trim().toLowerCase()
    const minScore = Number(url.searchParams.get("min_score") || Number.NEGATIVE_INFINITY)
    const maxScore = Number(url.searchParams.get("max_score") || Number.POSITIVE_INFINITY)
    const createdFrom = parseDate(url.searchParams.get("created_from"))
    const createdToBase = parseDate(url.searchParams.get("created_to"))
    const createdTo = createdToBase === null ? null : createdToBase + 86399999
    const hasEmail = parseBool(url.searchParams.get("has_email"))
    const hasPhone = parseBool(url.searchParams.get("has_phone"))
    const hasLinkedin = parseBool(url.searchParams.get("has_linkedin"))
    const sort = String(url.searchParams.get("sort") || "created_at")
    const order = String(url.searchParams.get("order") || "desc").toLowerCase() === "asc" ? "asc" : "desc"

    let rows = (state.leads as any[]).filter((lead) => {
      if (!q) return true
      const content = [
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.company?.name,
        lead.company?.industry,
        lead.company?.location,
        lead.segment,
        Array.isArray(lead.tags) ? lead.tags.join(" ") : "",
      ].join(" ").toLowerCase()
      return content.includes(q)
    })
    if (status) rows = rows.filter((lead) => String(lead.status) === status)
    if (segment) rows = rows.filter((lead) => String(lead.segment || "").toLowerCase().includes(segment))
    if (tier) rows = rows.filter((lead) => String(lead.score?.tier || "") === tier)
    if (heatStatus) rows = rows.filter((lead) => String(lead.score?.heat_status || "") === heatStatus)
    if (company) rows = rows.filter((lead) => String(lead.company?.name || "").toLowerCase().includes(company))
    if (industry) rows = rows.filter((lead) => String(lead.company?.industry || "").toLowerCase().includes(industry))
    if (location) rows = rows.filter((lead) => String(lead.company?.location || "").toLowerCase().includes(location))
    if (tag) rows = rows.filter((lead) => Array.isArray(lead.tags) && lead.tags.some((item: string) => item.toLowerCase().includes(tag)))
    rows = rows.filter((lead: any) => Number(lead.total_score || 0) >= minScore && Number(lead.total_score || 0) <= maxScore)
    if (createdFrom !== null) rows = rows.filter((lead: any) => Date.parse(String(lead.created_at || "")) >= createdFrom)
    if (createdTo !== null) rows = rows.filter((lead: any) => Date.parse(String(lead.created_at || "")) <= createdTo)
    if (hasEmail !== null) rows = rows.filter((lead: any) => (hasEmail ? Boolean(lead.email) : !lead.email))
    if (hasPhone !== null) rows = rows.filter((lead: any) => (hasPhone ? Boolean(lead.phone) : !lead.phone))
    if (hasLinkedin !== null) rows = rows.filter((lead: any) => (hasLinkedin ? Boolean(lead.linkedin_url) : !lead.linkedin_url))

    const value = (lead: any) => {
      if (sort === "first_name") return `${lead.first_name || ""} ${lead.last_name || ""}`
      if (sort === "status") return lead.status
      if (sort === "total_score") return Number(lead.total_score || 0)
      if (sort === "updated_at") return lead.updated_at
      return lead.created_at
    }
    rows.sort((a: any, b: any) => {
      const c = cmp(value(a), value(b))
      return order === "asc" ? c : -c
    })

    const total = rows.length
    return { page, page_size: pageSize, total, items: rows.slice((page - 1) * pageSize, page * pageSize).map(asLeadList) }
  }
  if (pathname === "/api/v1/admin/leads" && method === "POST") {
    const first = String(body.first_name || "Nouveau")
    const last = String(body.last_name || "Lead")
    const companyName = String(body.company_name || "Entreprise")
    const created = {
      id: nextId("lead"),
      first_name: first,
      last_name: last,
      email: String(body.email || `${first}.${last}@example.com`).toLowerCase(),
      phone: body.phone ? String(body.phone) : null,
      linkedin_url: body.linkedin_url ? String(body.linkedin_url) : null,
      company: {
        name: companyName,
        domain: `${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "company"}.com`,
        industry: String(body.company_industry || "SaaS"),
        location: String(body.company_location || "Paris, FR"),
      },
      status: String(body.status || "NEW"),
      segment: String(body.segment || "General"),
      tags: ["manual"],
      total_score: 40,
      score: {
        icp_score: 20,
        heat_score: 20,
        tier: "Tier C",
        heat_status: "Cold",
        next_best_action: "Qualification initiale",
        icp_breakdown: { fit_size_match: 8 },
        heat_breakdown: { intent_signal: 8 },
        last_scored_at: nowIso(),
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    }
      ; (state.leads as any[]).unshift(created)
      ; (state.notifications as any[]).unshift({
        id: nextId("notif"),
        event_key: "lead_created",
        title: `Nouveau lead: ${first} ${last}`,
        message: `${companyName} ajoute depuis formulaire.`,
        channel: "in_app",
        is_read: false,
        created_at: nowIso(),
        link_href: "/leads",
        entity_type: "lead",
        entity_id: created.id,
      })
    return clone(created)
  }
  if (pathname === "/api/v1/admin/leads/bulk-delete" && method === "POST") {
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((item) => String(item)) : []
    state.leads = (state.leads as any[]).filter((lead) => !ids.includes(String(lead.id)))
    state.tasks = (state.tasks as any[]).filter((task) => !ids.includes(String(task.lead_id || "")))
    state.projects = (state.projects as any[]).filter((project) => !ids.includes(String(project.lead_id || "")))
    return { ok: true, deleted: ids.length }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+$/) && method === "DELETE") {
    const id = pathname.split("/").pop() || ""
    state.leads = (state.leads as any[]).filter((lead) => String(lead.id) !== id)
    state.tasks = (state.tasks as any[]).filter((task) => String(task.lead_id || "") !== id)
    state.projects = (state.projects as any[]).filter((project) => String(project.lead_id || "") !== id)
    return { ok: true, id }
  }
  if (pathname === "/api/v1/admin/tasks" && method === "GET") {
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase()
    const status = String(url.searchParams.get("status") || "").trim()
    const channel = String(url.searchParams.get("channel") || "").trim()
    const source = String(url.searchParams.get("source") || "").trim()
    const projectId = String(url.searchParams.get("project_id") || "").trim()
    const sort = String(url.searchParams.get("sort") || "created_at")
    const order = String(url.searchParams.get("order") || "desc").toLowerCase() === "asc" ? "asc" : "desc"
    let rows = (state.tasks as any[]).filter((task: any) => {
      if (!q) return true
      const content = `${task.title || ""} ${task.description || ""} ${task.assigned_to || ""} ${task.source || ""} ${task.channel || ""} ${task.project_id || ""}`.toLowerCase()
      return content.includes(q)
    })
    if (status) rows = rows.filter((task: any) => String(task.status) === status)
    if (channel) rows = rows.filter((task: any) => String(task.channel) === channel)
    if (source) rows = rows.filter((task: any) => String(task.source) === source)
    if (projectId) rows = rows.filter((task: any) => String(task.project_id || "") === projectId)
    const value = (task: any) => {
      if (sort === "title") return task.title
      if (sort === "status") return task.status
      if (sort === "priority") return task.priority
      if (sort === "due_date") return task.due_date
      if (sort === "assigned_to") return task.assigned_to
      if (sort === "project_id") return task.project_id
      if (sort === "channel") return task.channel
      if (sort === "source") return task.source
      if (sort === "sequence_step") return Number(task.sequence_step || 0)
      return task.created_at
    }
    rows.sort((a: any, b: any) => {
      const c = cmp(value(a), value(b))
      return order === "asc" ? c : -c
    })
    return { page, page_size: pageSize, total: rows.length, items: rows.slice((page - 1) * pageSize, page * pageSize) }
  }
  if (pathname === "/api/v1/admin/tasks" && method === "POST") {
    const now = nowIso()
    const projectId = body.project_id ? String(body.project_id) : null
    const linkedProject = projectId
      ? (state.projects as any[]).find((project: any) => String(project.id) === projectId)
      : null
    const created = {
      id: nextId("task"),
      title: String(body.title || "Nouvelle tache"),
      description: body.description ? String(body.description) : "",
      status: String(body.status || "To Do"),
      priority: String(body.priority || "Medium"),
      due_date: body.due_date ? String(body.due_date) : daysFromNow(2),
      assigned_to: body.assigned_to ? String(body.assigned_to) : "Vous",
      lead_id: body.lead_id ? String(body.lead_id) : null,
      project_id: projectId,
      project_name: body.project_name ? String(body.project_name) : linkedProject?.name || null,
      channel: String(body.channel || "email"),
      sequence_step: Math.max(1, Number(body.sequence_step || 1)),
      source: String(body.source || "manual"),
      rule_id: body.rule_id ? String(body.rule_id) : null,
      related_score_snapshot: { total_score: 0, tier: "Tier C" },
      subtasks: Array.isArray(body.subtasks) ? body.subtasks : [],
      comments: [],
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      timeline: [
        {
          id: nextId("timeline"),
          event_type: "task_created",
          message: "Tache creee.",
          actor: "system",
          created_at: now,
          metadata: {},
        },
      ],
      created_at: now,
      updated_at: now,
      closed_at: null,
    }
      ; (state.tasks as any[]).unshift(created)
    return clone(created)
  }
  if (pathname.match(/^\/api\/v1\/admin\/tasks\/[^/]+$/) && method === "GET") {
    const id = pathname.split("/").pop() || ""
    const row = (state.tasks as any[]).find((task) => String(task.id) === id)
    if (!row) throw new Error("Tache introuvable")
    const lead = (state.leads as any[]).find((item) => String(item.id) === String(row.lead_id || ""))
    const project = row.project_id
      ? (state.projects as any[]).find((item) => String(item.id) === String(row.project_id))
      : (state.projects as any[]).find((item) => String(item.lead_id || "") === String(row.lead_id || ""))
    return clone({
      ...row,
      lead: lead
        ? {
          id: lead.id,
          name: `${lead.first_name} ${lead.last_name}`.trim(),
          email: lead.email,
          status: lead.status,
          company_name: lead.company?.name || null,
          total_score: lead.total_score || 0,
          tier: lead.score?.tier || "Tier C",
          heat_status: lead.score?.heat_status || "Cold",
        }
        : undefined,
      project: project
        ? {
          id: project.id,
          name: project.name,
          status: project.status,
          due_date: project.due_date || null,
        }
        : undefined,
    })
  }
  if (pathname.match(/^\/api\/v1\/admin\/tasks\/[^/]+\/comments$/) && method === "POST") {
    const id = pathname.split("/")[5]
    const row = (state.tasks as any[]).find((task) => String(task.id) === id)
    if (!row) throw new Error("Tache introuvable")
    const now = nowIso()
    const comment = {
      id: nextId("comment"),
      body: String(body.body || "").trim(),
      author: String(body.author || "Vous"),
      mentions: Array.isArray(body.mentions) ? (body.mentions as unknown[]).map((item) => String(item)) : [],
      created_at: now,
    }
    if (!comment.body) throw new Error("Commentaire vide")
    row.comments = Array.isArray(row.comments) ? row.comments : []
    row.comments.push(comment)
    row.timeline = [
      {
        id: nextId("timeline"),
        event_type: "comment_added",
        message: "Nouveau commentaire ajoute.",
        actor: comment.author,
        created_at: now,
        metadata: { mentions: comment.mentions },
      },
      ...(Array.isArray(row.timeline) ? row.timeline : []),
    ]
    row.updated_at = now
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/tasks\/[^/]+\/close$/) && method === "POST") {
    const id = pathname.split("/")[5]
    const row = (state.tasks as any[]).find((task) => String(task.id) === id)
    if (!row) throw new Error("Tache introuvable")
    const now = nowIso()
    row.status = "Done"
    row.closed_at = now
    row.updated_at = now
    row.timeline = [
      {
        id: nextId("timeline"),
        event_type: "task_closed",
        message: "Tache fermee.",
        actor: "system",
        created_at: now,
        metadata: {},
      },
      ...(Array.isArray(row.timeline) ? row.timeline : []),
    ]
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/tasks\/[^/]+$/) && method === "PATCH") {
    const id = pathname.split("/").pop() || ""
    const row = (state.tasks as any[]).find((task) => String(task.id) === id)
    if (!row) throw new Error("Tache introuvable")
    const now = nowIso()
    const previousStatus = String(row.status || "To Do")
    Object.assign(row, body, { updated_at: now })
    if (String(row.status || "") === "Done" && !row.closed_at) {
      row.closed_at = now
    }
    if (previousStatus !== String(row.status || "")) {
      row.timeline = [
        {
          id: nextId("timeline"),
          event_type: "status_changed",
          message: `Statut: ${previousStatus} -> ${row.status}.`,
          actor: "system",
          created_at: now,
          metadata: { from: previousStatus, to: row.status },
        },
        ...(Array.isArray(row.timeline) ? row.timeline : []),
      ]
    }
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/tasks\/[^/]+$/) && method === "DELETE") {
    const id = pathname.split("/").pop() || ""
    state.tasks = (state.tasks as any[]).filter((task) => String(task.id) !== id)
    return { ok: true, id }
  }
  if (pathname === "/api/v1/admin/projects" && method === "GET") return clone(state.projects)
  if (pathname === "/api/v1/admin/projects" && method === "POST") {
    const created = {
      id: nextId("project"),
      name: String(body.name || "Nouveau projet"),
      description: body.description ? String(body.description) : null,
      status: String(body.status || "Planning"),
      lead_id: body.lead_id ? String(body.lead_id) : null,
      progress_percent: Math.max(0, Math.min(100, Number(body.progress_percent || 0))),
      budget_total: body.budget_total != null ? Number(body.budget_total) : null,
      budget_spent: body.budget_spent != null ? Number(body.budget_spent) : 0,
      team: Array.isArray(body.team) ? clone(body.team) : [],
      timeline: Array.isArray(body.timeline) ? clone(body.timeline) : [],
      deliverables: Array.isArray(body.deliverables) ? clone(body.deliverables) : [],
      due_date: body.due_date ? String(body.due_date) : null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
      ; (state.projects as any[]).unshift(created)
    return clone(created)
  }
  if (pathname.match(/^\/api\/v1\/admin\/projects\/[^/]+$/) && method === "GET") {
    const id = pathname.split("/").pop() || ""
    const row = (state.projects as any[]).find((project) => String(project.id) === id)
    if (!row) throw new Error("Projet introuvable")
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/projects\/[^/]+$/) && method === "PATCH") {
    const id = pathname.split("/").pop() || ""
    const row = (state.projects as any[]).find((project) => String(project.id) === id)
    if (!row) throw new Error("Projet introuvable")
    Object.assign(row, body, { updated_at: nowIso() })
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/projects\/[^/]+\/activity$/) && method === "GET") {
    const id = pathname.split("/")[5]
    const project = (state.projects as any[]).find((item) => String(item.id) === id)
    if (!project) throw new Error("Projet introuvable")
    const rows: any[] = []
    rows.push({
      id: `activity-project-${id}`,
      title: "Projet cree",
      actor: "system",
      action: "project_created",
      timestamp: String(project.created_at || nowIso()),
    })
    rows.push({
      id: `activity-project-update-${id}`,
      title: "Projet mis a jour",
      actor: "system",
      action: "project_updated",
      timestamp: String(project.updated_at || nowIso()),
    })
    const projectTasks = (state.tasks as any[])
      .filter((task) => String(task.project_id || "") === id)
      .slice(0, 20)
      .map((task) => ({
        id: `activity-task-${task.id}`,
        title: task.title,
        actor: String(task.assigned_to || "team"),
        action: "task_updated",
        timestamp: String(task.updated_at || task.created_at || nowIso()),
      }))
    rows.push(...projectTasks)
    rows.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    return { project_id: id, total: rows.length, items: rows.slice(0, 30) }
  }
  if (pathname.match(/^\/api\/v1\/admin\/projects\/[^/]+$/) && method === "DELETE") {
    const id = pathname.split("/").pop() || ""
    state.projects = (state.projects as any[]).filter((project) => String(project.id) !== id)
    return { ok: true, id }
  }
  if (pathname === "/api/v1/admin/notifications/preferences" && method === "GET") return clone(state.notification_preferences)
  if (pathname === "/api/v1/admin/notifications/preferences" && method === "PUT") {
    state.notification_preferences = { channels: { ...state.notification_preferences.channels, ...((body.channels as JsonObj) || {}) } }
    return clone(state.notification_preferences)
  }
  if (pathname === "/api/v1/admin/notifications" && method === "GET") {
    const unreadOnly = parseBool(url.searchParams.get("unread_only")) === true
    const channel = String(url.searchParams.get("channel") || "").trim()
    const eventKey = String(url.searchParams.get("event_key") || "").trim()
    const limit = Math.max(1, Number(url.searchParams.get("limit") || 50))
    let items = clone(state.notifications) as any[]
    if (unreadOnly) items = items.filter((item) => !item.is_read)
    if (channel) items = items.filter((item) => String(item.channel) === channel)
    if (eventKey) items = items.filter((item) => String(item.event_key) === eventKey)
    return { items: items.slice(0, limit), unread_count: (state.notifications as any[]).filter((n) => !n.is_read).length, next_cursor: null }
  }
  if (pathname === "/api/v1/admin/notifications" && method === "POST") {
    const created = {
      id: nextId("notif"),
      event_key: String(body.event_key || "report_ready"),
      title: String(body.title || "Notification"),
      message: String(body.message || "Message mock"),
      channel: String(body.channel || "in_app"),
      is_read: false,
      created_at: nowIso(),
      link_href: body.link_href ? String(body.link_href) : null,
      entity_type: body.entity_type ? String(body.entity_type) : null,
      entity_id: body.entity_id ? String(body.entity_id) : null,
    }
      ; (state.notifications as any[]).unshift(created)
    return clone(created)
  }
  if (pathname === "/api/v1/admin/notifications/mark-read" && method === "POST") {
    const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((item) => String(item)) : []
    state.notifications = (state.notifications as any[]).map((item) => ids.includes(String(item.id)) ? { ...item, is_read: true } : item)
    return { ok: true, updated: ids.length }
  }
  if (pathname === "/api/v1/admin/notifications/mark-all-read" && method === "POST") {
    state.notifications = (state.notifications as any[]).map((item) => ({ ...item, is_read: true }))
    return { ok: true, updated: (state.notifications as any[]).length }
  }
  if (pathname === "/api/v1/admin/billing" && method === "GET") {
    const invoices = state.billing.invoices as any[]
    const outstanding = invoices.filter((inv) => String(inv.status) !== "paid").reduce((acc, inv) => acc + Number(inv.amount_cents || 0), 0)
    const paid = invoices.filter((inv) => String(inv.status) === "paid").reduce((acc, inv) => acc + Number(inv.amount_cents || 0), 0)
    return { profile: clone(state.billing.profile), invoices: clone(invoices), summary: { invoice_count: invoices.length, outstanding_cents: outstanding, paid_cents: paid } }
  }
  if (pathname === "/api/v1/admin/billing" && method === "PUT") {
    state.billing.profile = { ...state.billing.profile, ...(body as JsonObj), updated_at: nowIso() }
    return clone(state.billing.profile)
  }
  if (pathname === "/api/v1/admin/billing/invoices" && method === "POST") {
    const created = {
      id: nextId("invoice"),
      invoice_number: String(body.invoice_number || `INV-${new Date().getFullYear()}-${(state.billing.invoices as any[]).length + 1}`),
      period_start: body.period_start ? String(body.period_start) : null,
      period_end: body.period_end ? String(body.period_end) : null,
      issued_at: nowIso(),
      due_at: body.due_at ? String(body.due_at) : daysFromNow(14),
      status: String(body.status || "issued"),
      currency: String(body.currency || state.billing.profile.currency || "EUR"),
      amount_cents: Math.max(0, Number(body.amount_cents || 0)),
      notes: body.notes ? String(body.notes) : null,
    }
      ; (state.billing.invoices as any[]).unshift(created)
    return clone(created)
  }
  if (pathname === "/api/v1/admin/reports/schedules" && method === "GET") return { items: clone(state.report_schedules) }
  if (pathname === "/api/v1/admin/reports/schedules" && method === "POST") {
    const created = {
      id: nextId("schedule"),
      name: String(body.name || "Nouvelle planification"),
      frequency: String(body.frequency || "weekly"),
      timezone: String(body.timezone || "Europe/Paris"),
      hour_local: Math.max(0, Math.min(23, Number(body.hour_local || 9))),
      minute_local: Math.max(0, Math.min(59, Number(body.minute_local || 0))),
      format: String(body.format || "pdf"),
      recipients: Array.isArray(body.recipients) ? (body.recipients as unknown[]).map((item) => String(item)) : [],
      enabled: body.enabled !== false,
      last_run_at: null,
      next_run_at: daysFromNow(1),
    }
      ; (state.report_schedules as any[]).unshift(created)
    return clone(created)
  }
  if (pathname === "/api/v1/admin/reports/schedules/runs" && method === "GET") return { items: clone(state.report_runs) }
  if (pathname === "/api/v1/admin/reports/schedules/run-due" && method === "POST") {
    const enabled = (state.report_schedules as any[]).filter((row) => row.enabled !== false)
    for (const schedule of enabled) {
      ; (state.report_runs as any[]).unshift({
        id: nextId("report-run"),
        schedule_id: schedule.id,
        status: "completed",
        output_format: String(schedule.format || "pdf"),
        recipient_count: Array.isArray(schedule.recipients) ? schedule.recipients.length : 0,
        started_at: nowIso(),
        finished_at: nowIso(),
        message: `Execution ${schedule.name} terminee`,
      })
      schedule.last_run_at = nowIso()
      schedule.next_run_at = daysFromNow(String(schedule.frequency) === "daily" ? 1 : String(schedule.frequency) === "weekly" ? 7 : 30)
    }
    return { executed: enabled.length }
  }
  if (pathname.match(/^\/api\/v1\/admin\/reports\/schedules\/[^/]+$/) && method === "DELETE") {
    const id = pathname.split("/").pop() || ""
    state.report_schedules = (state.report_schedules as any[]).filter((row) => String(row.id) !== id)
    return { ok: true, id }
  }
  if (pathname === "/api/v1/admin/reports/30d" && method === "GET") {
    const windowRaw = String(url.searchParams.get("window") || "30d")
    const days = windowRaw === "7d" ? 7 : windowRaw === "90d" ? 90 : windowRaw === "ytd" ? Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000)) : 30
    const fromMs = Date.now() - days * 86400000
    const leads = (state.leads as any[]).filter((lead) => Date.parse(String(lead.created_at || 0)) >= fromMs)
    const tasks = (state.tasks as any[]).filter((task) => Date.parse(String(task.created_at || 0)) >= fromMs)
    const tasksDone = tasks.filter((task) => String(task.status) === "Done")
    const timeline = [
      ...tasks.slice(0, 14).map((task) => ({
        id: `timeline-task-${task.id}`,
        event_type: "task",
        timestamp: task.created_at,
        title: task.title,
        description: `${task.status} / ${task.channel}`,
        channel: task.channel,
      })),
      ...leads.slice(0, 14).map((lead) => ({
        id: `timeline-lead-${lead.id}`,
        event_type: "lead",
        timestamp: lead.created_at,
        title: `${lead.first_name} ${lead.last_name}`,
        description: `${lead.company?.name || "Entreprise"} (${lead.status})`,
        channel: undefined,
      })),
    ].sort((a, b) => cmp(b.timestamp, a.timestamp)).slice(0, 30)
    const trend = Array.from({ length: Math.min(days, 30) }).map((_, i) => {
      const day = new Date(Date.now() - (Math.min(days, 30) - 1 - i) * 86400000).toISOString().slice(0, 10)
      const created = leads.filter((lead) => String(lead.created_at || "").slice(0, 10) === day).length
      const scored = leads.filter((lead) => String(lead.score?.last_scored_at || "").slice(0, 10) === day).length
      const contacted = leads.filter((lead) => String(lead.updated_at || "").slice(0, 10) === day && ["CONTACTED", "INTERESTED", "CONVERTED"].includes(String(lead.status))).length
      const closed = leads.filter((lead) => String(lead.updated_at || "").slice(0, 10) === day && String(lead.status) === "CONVERTED").length
      const tasksCreated = tasks.filter((task) => String(task.created_at || "").slice(0, 10) === day).length
      const tasksCompleted = tasksDone.filter((task) => String(task.updated_at || "").slice(0, 10) === day).length
      return { date: day, created, scored, contacted, closed, tasks_created: tasksCreated, tasks_completed: tasksCompleted }
    })
    const channelBreakdown = ["email", "linkedin", "call"].map((channel) => {
      const subset = tasks.filter((task) => String(task.channel) === channel)
      return { channel, count: subset.length, completed: subset.filter((task) => String(task.status) === "Done").length }
    })
    const stale = (state.leads as any[]).filter((lead) => Date.parse(String(lead.score?.last_scored_at || 0)) < Date.now() - 14 * 86400000).length
    const unassigned = (state.tasks as any[]).filter((task) => !task.assigned_to).length
    return {
      window: { label: days === 7 ? "7 jours" : days === 90 ? "90 jours" : windowRaw === "ytd" ? "Année en cours" : "30 jours", days, from: new Date(fromMs).toISOString(), to: nowIso() },
      kpis: {
        leads_created_total: leads.length,
        leads_scored_total: leads.filter((lead) => Number(lead.total_score || 0) > 0).length,
        leads_contacted_total: leads.filter((lead) => ["CONTACTED", "INTERESTED", "CONVERTED"].includes(String(lead.status))).length,
        leads_closed_total: leads.filter((lead) => String(lead.status) === "CONVERTED").length,
        tasks_created_total: tasks.length,
        tasks_completed_total: tasksDone.length,
        task_completion_rate: tasks.length ? (tasksDone.length / tasks.length) * 100 : 0,
      },
      daily_trend: trend,
      timeline_items: timeline,
      channel_breakdown: channelBreakdown,
      quality_flags: { stale_unscored_leads: stale, unassigned_tasks: unassigned },
    }
  }
  if (pathname === "/api/v1/admin/campaigns" && method === "GET") {
    const rows = clone(state.campaigns) as any[]
    return { items: rows, total: rows.length, limit: 50, offset: 0 }
  }
  if (pathname === "/api/v1/admin/campaigns" && method === "POST") {
    const created = {
      id: nextId("campaign"),
      name: String(body.name || "Campaign mock"),
      description: body.description ? String(body.description) : null,
      status: String(body.status || "draft"),
      sequence_id: body.sequence_id ? String(body.sequence_id) : null,
      channel_strategy: (body.channel_strategy as JsonObj) || {},
      enrollment_filter: (body.enrollment_filter as JsonObj) || {},
      created_at: nowIso(),
      updated_at: nowIso(),
    }
      ; (state.campaigns as any[]).unshift(created)
    return clone(created)
  }
  if (pathname.match(/^\/api\/v1\/admin\/campaigns\/[^/]+$/) && method === "PATCH") {
    const campaignId = pathname.split("/")[5]
    const row = (state.campaigns as any[]).find((item) => item.id === campaignId)
    if (!row) throw new Error("Campaign introuvable")
    row.name = body.name ? String(body.name) : row.name
    row.description = body.description !== undefined ? (body.description ? String(body.description) : null) : row.description
    row.status = body.status ? String(body.status) : row.status
    row.sequence_id = body.sequence_id !== undefined ? (body.sequence_id ? String(body.sequence_id) : null) : row.sequence_id
    row.channel_strategy = body.channel_strategy !== undefined ? ((body.channel_strategy as JsonObj) || {}) : row.channel_strategy
    row.enrollment_filter = body.enrollment_filter !== undefined ? ((body.enrollment_filter as JsonObj) || {}) : row.enrollment_filter
    row.updated_at = nowIso()
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/campaigns\/[^/]+\/activate$/) && method === "POST") {
    const campaignId = pathname.split("/")[5]
    const row = (state.campaigns as any[]).find((item) => item.id === campaignId)
    if (!row) throw new Error("Campaign introuvable")
    row.status = "active"
    row.updated_at = nowIso()
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/campaigns\/[^/]+\/pause$/) && method === "POST") {
    const campaignId = pathname.split("/")[5]
    const row = (state.campaigns as any[]).find((item) => item.id === campaignId)
    if (!row) throw new Error("Campaign introuvable")
    row.status = "paused"
    row.updated_at = nowIso()
    return clone(row)
  }
  if (pathname.match(/^\/api\/v1\/admin\/campaigns\/[^/]+\/enroll$/) && method === "POST") {
    const campaignId = pathname.split("/")[5]
    const row = (state.campaigns as any[]).find((item) => item.id === campaignId)
    if (!row) throw new Error("Campaign introuvable")

    const filters = (body.filters as JsonObj) || {}
    const statuses = Array.isArray(filters.statuses) && filters.statuses.length > 0
      ? (filters.statuses as unknown[]).map((item) => String(item))
      : ["NEW", "ENRICHED", "SCORED", "CONTACTED"]
    const maxLeads = Math.max(1, Math.min(500, Number(body.max_leads || 50)))

    const candidates = (state.leads as any[]).filter((lead) => statuses.includes(String(lead.status))).slice(0, maxLeads)
    let created = 0
    let skipped = 0
    for (const lead of candidates) {
      const exists = (state.campaign_runs as any[]).some((run) => run.campaign_id === campaignId && run.lead_id === lead.id)
      if (exists) {
        skipped += 1
        continue
      }
      ; (state.campaign_runs as any[]).unshift({
        id: nextId("run"),
        campaign_id: campaignId,
        enrollment_id: nextId("enroll"),
        lead_id: lead.id,
        trigger_source: "manual",
        action_type: "nurture_step",
        status: "executed",
        step_index: 1,
        payload: { source: "mock", campaign_name: row.name },
        result: { created: true },
        error_message: null,
        created_at: nowIso(),
        executed_at: nowIso(),
      })
      created += 1
    }
    return { created, skipped }
  }
  if (pathname.match(/^\/api\/v1\/admin\/campaigns\/[^/]+\/runs$/) && method === "GET") {
    const campaignId = pathname.split("/")[5]
    const statusFilter = String(url.searchParams.get("status") || "")
    let rows = (state.campaign_runs as any[]).filter((run) => run.campaign_id === campaignId)
    if (statusFilter) rows = rows.filter((run) => String(run.status) === statusFilter)
    return { items: clone(rows), total: rows.length, limit: 50, offset: 0 }
  }

  if (pathname === "/api/v1/admin/sequences" && method === "GET") return { items: clone(state.sequences) }
  if (pathname === "/api/v1/admin/sequences" && method === "POST") {
    const created = {
      id: nextId("sequence"),
      name: String(body.name || "Sequence mock"),
      description: body.description ? String(body.description) : null,
      status: String(body.status || "draft"),
      channels: Array.isArray(body.channels) ? (body.channels as unknown[]).map((item) => String(item)) : ["email"],
      steps: Array.isArray(body.steps) ? clone(body.steps) : [],
      created_at: nowIso(),
      updated_at: nowIso(),
    }
      ; (state.sequences as any[]).unshift(created)
    return clone(created)
  }
  if (pathname.match(/^\/api\/v1\/admin\/sequences\/[^/]+\/simulate$/) && method === "POST") {
    const sequenceId = pathname.split("/")[5]
    const row = (state.sequences as any[]).find((item) => item.id === sequenceId)
    if (!row) throw new Error("Sequence introuvable")
    const leadContext = (body.lead_context as JsonObj) || {}
    const startAt = body.start_at ? new Date(String(body.start_at)) : new Date()
    let cursor = new Date(startAt.getTime())
    const timeline = (Array.isArray(row.steps) ? row.steps : []).map((step: any, index: number) => {
      const delayDays = Math.max(0, Number(step.delay_days || 0))
      cursor = new Date(cursor.getTime() + delayDays * 86400000)
      const minHeat = Number((step.conditions || {}).min_heat_score || 0)
      const heatScore = Number(leadContext.heat_score || 0)
      return {
        step: Number(step.step || index + 1),
        channel: String(step.channel || "email"),
        template_key: String(step.template_key || ""),
        delay_days: delayDays,
        scheduled_at: cursor.toISOString(),
        skip: minHeat > 0 ? heatScore < minHeat : false,
        conditions: step.conditions || {},
      }
    })
    return {
      sequence_id: row.id,
      sequence_name: row.name,
      start_at: startAt.toISOString(),
      timeline,
    }
  }

  if (pathname === "/api/v1/admin/content/generate" && method === "POST") {
    const channel = String(body.channel || "email")
    const step = Math.max(1, Number(body.step || 1))
    const context = (body.context as JsonObj) || {}
    const firstName = String(context.first_name || "Bonjour")
    const companyName = String(context.company_name || "votre entreprise")
    const subject = channel === "email" ? `${firstName}, opportunite concrete pour ${companyName}` : null
    const generated = {
      id: nextId("content"),
      lead_id: body.lead_id ? String(body.lead_id) : null,
      channel,
      step,
      template_key: body.template_key ? String(body.template_key) : null,
      provider: String(body.provider || "deterministic"),
      subject,
      body: channel !== "call" ? `Bonjour ${firstName}, voici un message ${channel} mock pour ${companyName}.` : null,
      call_script: channel === "call" ? `Bonjour ${firstName}, script d'appel mock pour ${companyName}.` : null,
      variables_used: Object.keys(context),
      confidence: 0.78,
      created_at: nowIso(),
    }
      ; (state.content_generations as any[]).unshift(generated)
    return clone(generated)
  }

  if (pathname === "/api/v1/admin/enrichment/run" && method === "POST") {
    const query = String(body.query || "")
    const provider = String(body.provider || "mock")
    const context = (body.context as JsonObj) || {}
    const job = {
      id: nextId("enrich"),
      lead_id: body.lead_id ? String(body.lead_id) : null,
      query,
      provider,
      status: "completed",
      relevance_score: 72,
      result: {
        query,
        provider,
        summary: {
          company: { name: String(context.company_name || "Acme") },
          recommendations: [
            "Prioriser les leads warm sur sequence email+call.",
            "Lancer un follow-up J+2 avec message personnalise.",
          ],
        },
        context_used: context,
      },
      error_message: null,
      created_at: nowIso(),
      finished_at: nowIso(),
    }
      ; (state.enrichment_jobs as any[]).unshift(job)
    return clone(job)
  }
  if (pathname.match(/^\/api\/v1\/admin\/enrichment\/[^/]+$/) && method === "GET") {
    const jobId = pathname.split("/")[5]
    const job = (state.enrichment_jobs as any[]).find((item) => item.id === jobId)
    if (!job) throw new Error("Enrichment job introuvable")
    return clone(job)
  }
  if (pathname === "/api/v1/admin/assistant/prospect/runs" && method === "GET") {
    const limit = Math.max(1, Number(url.searchParams.get("limit") || 10))
    const items = clone(state.assistant_runs).slice(0, limit).map((run: any) => ({ id: run.id, prompt: run.prompt, status: run.status, actor: run.actor, summary: run.summary, action_count: (run.actions || []).length, created_at: run.created_at, finished_at: run.finished_at }))
    return { items, total: (state.assistant_runs as any[]).length }
  }
  if (pathname === "/api/v1/admin/assistant/prospect/execute" && method === "POST") {
    const prompt = String(body.prompt || "Run mock")
    const maxLeads = Math.max(1, Math.min(100, Number(body.max_leads || 20)))
    const autoConfirm = body.auto_confirm !== false
    const selectedLeads = (state.leads as any[]).slice(0, Math.min(maxLeads, 5))
    const actions = selectedLeads.map((lead, idx) => ({
      id: nextId("action"),
      action_type: "create_task",
      entity_type: "task",
      payload: { lead_id: lead.id, title: `Follow-up IA ${lead.first_name} ${lead.last_name}`, channel: idx % 2 === 0 ? "email" : "call" },
      requires_confirm: !autoConfirm,
      status: autoConfirm ? "done" : "pending_confirmation",
      result: autoConfirm ? { ok: true } : {},
      created_at: nowIso(),
      executed_at: autoConfirm ? nowIso() : null,
    }))
    if (autoConfirm) {
      for (const action of actions) {
        const now = nowIso()
          ; (state.tasks as any[]).unshift({
            id: nextId("task"),
            title: String(action.payload.title || "Tache IA"),
            description: "Tache generee automatiquement par l'assistant.",
            status: "To Do",
            priority: "Medium",
            due_date: daysFromNow(2),
            assigned_to: "Vous",
            lead_id: String(action.payload.lead_id || ""),
            project_id: null,
            project_name: null,
            channel: String(action.payload.channel || "email"),
            sequence_step: 1,
            source: "assistant",
            rule_id: null,
            related_score_snapshot: { total_score: 0, tier: "Tier C" },
            subtasks: [],
            comments: [],
            attachments: [],
            timeline: [
              {
                id: nextId("timeline"),
                event_type: "task_created",
                message: "Tache creee par assistant.",
                actor: "assistant",
                created_at: now,
                metadata: {},
              },
            ],
            created_at: now,
            updated_at: now,
            closed_at: null,
          })
      }
    }
    const run = {
      id: nextId("run"),
      prompt,
      status: autoConfirm ? "completed" : "awaiting_confirmation",
      actor: "user",
      summary: autoConfirm ? `${actions.length} action(s) executee(s).` : `${actions.length} action(s) en attente de confirmation.`,
      config: { max_leads: maxLeads, auto_confirm: autoConfirm, source: String(body.source || "manual") },
      created_at: nowIso(),
      finished_at: autoConfirm ? nowIso() : null,
      actions,
    }
      ; (state.assistant_runs as any[]).unshift(run)
    return clone(run)
  }
  if (pathname === "/api/v1/admin/assistant/prospect/confirm" && method === "POST") {
    const ids = Array.isArray(body.action_ids) ? (body.action_ids as unknown[]).map((item) => String(item)) : []
    const approve = body.approve !== false
    let updated = 0
    for (const run of state.assistant_runs as any[]) {
      for (const action of run.actions || []) {
        if (!ids.includes(String(action.id))) continue
        action.status = approve ? "done" : "rejected"
        action.executed_at = nowIso()
        action.result = approve ? { ok: true } : { ok: false, reason: "rejected_by_user" }
        updated += 1
      }
      if (String(run.status) === "awaiting_confirmation" && (run.actions || []).every((a: any) => String(a.status) !== "pending_confirmation")) {
        run.status = approve ? "completed" : "cancelled"
        run.finished_at = nowIso()
      }
    }
    return { ok: true, updated }
  }
  if (pathname === "/api/v1/admin/search" && method === "GET") {
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase()
    const limit = Math.max(1, Number(url.searchParams.get("limit") || 10))
    if (!q) return { query: "", total: 0, items: [] }
    const leadItems = (state.leads as any[])
      .filter((lead) => `${lead.first_name} ${lead.last_name} ${lead.email} ${lead.company?.name || ""}`.toLowerCase().includes(q))
      .map((lead) => ({ type: "lead", id: lead.id, title: `${lead.first_name} ${lead.last_name}`, subtitle: `${lead.company?.name || "Entreprise"} - ${lead.status}`, href: `/leads/${encodeURIComponent(String(lead.id))}` }))
    const taskItems = (state.tasks as any[])
      .filter((task) => `${task.title} ${task.status} ${task.source}`.toLowerCase().includes(q))
      .map((task) => ({ type: "task", id: task.id, title: task.title, subtitle: `${task.status} - ${task.priority}`, href: `/tasks/${encodeURIComponent(String(task.id))}` }))
    const projectItems = (state.projects as any[])
      .filter((project) => `${project.name} ${project.description || ""}`.toLowerCase().includes(q))
      .map((project) => ({ type: "project", id: project.id, title: project.name, subtitle: project.status, href: "/projects" }))
    const items = [...leadItems, ...taskItems, ...projectItems].slice(0, limit)
    return { query: q, total: items.length, items }
  }
  if (pathname === "/api/v1/admin/research/web" && method === "GET") {
    const q = String(url.searchParams.get("q") || "")
    const provider = String(url.searchParams.get("provider") || "auto")
    const limit = Math.max(1, Math.min(15, Number(url.searchParams.get("limit") || 8)))
    const providerUsed = provider === "auto" ? "duckduckgo" : provider
    const items = Array.from({ length: Math.min(limit, 6) }).map((_, i) => ({
      provider: providerUsed,
      source: "mock",
      title: `${q || "Recherche"} - insight ${i + 1}`,
      url: `https://example.com/research/${encodeURIComponent((q || "topic").toLowerCase().replace(/\s+/g, "-"))}/${i + 1}`,
      snippet: `Snippet mock ${i + 1} pour ${q || "votre sujet"}.`,
      published_at: daysAgo(i + 1),
    }))
    return { query: q, provider_selector: provider, providers_requested: [provider], providers_used: [providerUsed], total: items.length, items, warnings: [] }
  }

  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+$/) && method === "GET") {
    const id = pathname.split("/").pop() || ""
    const lead = (state.leads as any[]).find((l) => l.id === id)
    if (!lead) throw new Error("Lead introuvable")
    return clone(lead)
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/tasks$/) && method === "GET") {
    const id = pathname.split("/")[5]
    return clone((state.tasks as any[]).filter((task) => task.lead_id === id))
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/projects$/) && method === "GET") {
    const id = pathname.split("/")[5]
    return clone((state.projects as any[]).filter((project) => project.lead_id === id))
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/communication-plan$/) && method === "GET") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const hot = String(lead.score?.heat_status || "") === "Hot"
    return {
      lead_id: leadId,
      generated_at: nowIso(),
      confidence: hot ? 0.91 : 0.84,
      rule: { id: hot ? "rule-hot" : "rule-standard", name: hot ? "Hot Lead Acceleration" : "Plan standard", priority: hot ? "high" : "medium" },
      reasoning: [
        `Score total ${lead.total_score}, tier ${lead.score?.tier || "Tier C"}.`,
        `Heat ${lead.score?.heat_status || "Cold"} => cadence ${hot ? "rapide" : "progressive"}.`,
        `Segment ${lead.segment} / ${lead.company?.industry || "Industry"}.`,
      ],
      recommended_sequence: [
        { step: 1, day_offset: 0, channel: "email", title: "Accroche personnalisee", priority: "high", suggested_message: `Bonjour ${lead.first_name}, echange rapide sur ${lead.company?.name || "votre entreprise"}.` },
        { step: 2, day_offset: hot ? 1 : 2, channel: "linkedin", title: "Touchpoint LinkedIn", priority: "medium", suggested_message: "Invitation + contexte secteur." },
        { step: 3, day_offset: hot ? 2 : 4, channel: "call", title: "Call qualification", priority: hot ? "high" : "medium", suggested_message: "Call 10 min pour cadrer timing/budget." },
      ],
      score_snapshot: {
        total_score: Number(lead.total_score || 0),
        icp_score: Number(lead.score?.icp_score || 0),
        heat_score: Number(lead.score?.heat_score || 0),
        tier: String(lead.score?.tier || "Tier C"),
        heat_status: String(lead.score?.heat_status || "Cold"),
        next_best_action: String(lead.score?.next_best_action || ""),
        last_scored_at: lead.score?.last_scored_at || null,
      },
    }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/history$/) && method === "GET") {
    const leadId = pathname.split("/")[5]
    const windowRaw = String(url.searchParams.get("window") || "30d")
    const days = windowRaw === "7d" ? 7 : windowRaw === "90d" ? 90 : windowRaw === "ytd" ? Math.max(1, Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000)) : 30
    const fromMs = Date.now() - days * 86400000
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const tasks = (state.tasks as any[]).filter((task) => String(task.lead_id || "") === leadId)
    const projects = (state.projects as any[]).filter((project) => String(project.lead_id || "") === leadId)
    const items = [
      { id: `hist-${leadId}-created`, event_type: "lead_created", timestamp: lead.created_at, title: "Lead cree", description: `${lead.first_name} ${lead.last_name} ajoute dans le pipeline.`, status: lead.status },
      { id: `hist-${leadId}-scored`, event_type: "score_updated", timestamp: lead.score?.last_scored_at || lead.updated_at, title: `Score ${lead.total_score}`, description: `${lead.score?.tier || "Tier C"} / ${lead.score?.heat_status || "Cold"}.`, status: lead.status },
      ...tasks.slice(0, 8).flatMap((task) => {
        const created = { id: `hist-task-${task.id}`, event_type: "task_created", timestamp: task.created_at, title: task.title, description: `${task.status} / ${task.priority}`, channel: task.channel, source: task.source, status: task.status }
        const done = String(task.status) === "Done"
          ? [{ id: `hist-task-done-${task.id}`, event_type: "task_completed", timestamp: task.updated_at || task.created_at, title: `Tache terminee (${task.channel})`, description: task.title, channel: task.channel, source: task.source, status: task.status }]
          : []
        return [created, ...done]
      }),
      ...projects.slice(0, 4).map((project) => ({ id: `hist-project-${project.id}`, event_type: "project_update", timestamp: project.updated_at || project.created_at, title: `Projet ${project.status}`, description: project.name, status: project.status })),
    ]
      .filter((item) => Date.parse(String(item.timestamp || 0)) >= fromMs)
      .sort((a, b) => cmp(b.timestamp, a.timestamp))
      .slice(0, 30)
    return { lead_id: leadId, window: windowRaw, total: items.length, items }
  }
  if (pathname.match(/^\/api\/v1\/admin\/leads\/[^/]+\/tasks\/auto-create$/) && method === "POST") {
    const leadId = pathname.split("/")[5]
    const lead = (state.leads as any[]).find((item) => String(item.id) === leadId)
    if (!lead) throw new Error("Lead introuvable")
    const channels = Array.isArray(body.channels) && body.channels.length > 0 ? (body.channels as unknown[]).map((item) => String(item)) : ["email", "linkedin", "call"]
    const createdRows = channels.map((channel, idx) => {
      const now = nowIso()
      return {
        id: nextId("task"),
        title: `${channel === "call" ? "Appeler" : channel === "linkedin" ? "Message LinkedIn" : "Email"} ${lead.first_name} ${lead.last_name}`,
        description: "Tache auto-generee depuis plan de communication.",
        status: "To Do",
        priority: idx === 0 ? "High" : "Medium",
        due_date: daysFromNow(idx + 1),
        assigned_to: "Vous",
        lead_id: leadId,
        project_id: null,
        project_name: null,
        channel,
        sequence_step: idx + 1,
        source: "auto-rule",
        rule_id: "rule-auto-comm",
        related_score_snapshot: { total_score: lead.total_score, tier: lead.score?.tier || "Tier C" },
        subtasks: [],
        comments: [],
        attachments: [],
        timeline: [
          {
            id: nextId("timeline"),
            event_type: "task_created",
            message: "Tache auto-creee.",
            actor: "system",
            created_at: now,
            metadata: {},
          },
        ],
        created_at: now,
        updated_at: now,
        closed_at: null,
      }
    })
      ; (state.tasks as any[]).unshift(...createdRows)
    return { created_count: createdRows.length }
  }
  if (pathname.match(/^\/api\/v1\/admin\/assistant\/prospect\/runs\/[^/]+$/) && method === "GET") {
    const id = pathname.split("/").pop() || ""
    const run = (state.assistant_runs as any[]).find((item) => String(item.id) === id)
    if (!run) return { id, prompt: "Mock prompt", status: "completed", actor: "user", summary: "Mock run", config: {}, created_at: nowIso(), finished_at: nowIso(), actions: [] }
    return clone(run)
  }

  if (pathname === "/api/v1/admin/import/csv/preview" && method === "POST") return { detected_table: "leads", selected_table: "leads", table_confidence: 0.9, headers: ["first_name", "last_name", "email"], suggested_mapping: {}, effective_mapping: {}, total_rows: 10, valid_rows: 9, invalid_rows: 1, errors: [{ row: 4, message: "Email format invalid (mock)." }], preview: [{ first_name: "Sophie", last_name: "Martin", email: "sophie@clinicflow.ca" }] }
  if (pathname === "/api/v1/admin/import/csv/commit" && method === "POST") return { table: "leads", processed_rows: 10, created: 8, updated: 1, skipped: 1, errors: [] }

  // Mutation endpoints: accept and return safe payloads to avoid UI errors in localhost mode.
  if (method !== "GET") return { ok: true, id: nextId("mock") }

  notFound(path)
}

export async function getMockResponse<T>(path: string, init?: RequestInit): Promise<T> {
  await sleep()
  return clone(handleJson(path, init)) as T
}

export async function getMockBlobResponse(path: string, init?: RequestInit): Promise<Blob> {
  await sleep()
  const url = toUrl(path)
  const state = stateFor(url)
  if (methodOf(init) !== "GET") throw new Error("[MOCK] Blob endpoint expects GET")
  if (url.pathname === "/api/v1/admin/export/csv") {
    const entity = String(url.searchParams.get("entity") || "leads")
    if (entity === "tasks") return new Blob([makeCsv((state.tasks as any[]).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, assigned_to: t.assigned_to })))], { type: "text/csv;charset=utf-8" })
    if (entity === "projects") return new Blob([makeCsv((state.projects as any[]).map((p) => ({ id: p.id, name: p.name, status: p.status, lead_id: p.lead_id })))], { type: "text/csv;charset=utf-8" })
    if (entity === "systems") return new Blob([makeCsv([{ organization_name: state.settings.organization_name, timezone: state.settings.timezone, support_email: state.settings.support_email, dashboard_refresh_seconds: state.settings.dashboard_refresh_seconds, scenario: state._scenario || "balanced" }])], { type: "text/csv;charset=utf-8" })
    return new Blob([makeCsv((state.leads as any[]).map((l) => ({ id: l.id, first_name: l.first_name, last_name: l.last_name, email: l.email, company_name: l.company?.name || "", status: l.status })))], { type: "text/csv;charset=utf-8" })
  }
  if (url.pathname === "/api/v1/admin/reports/export/pdf") {
    return new Blob([`PROSPECT MOCK REPORT\nGenerated at: ${nowIso()}\n`], { type: "application/pdf" })
  }
  throw new Error(`[MOCK] No blob mock data found for ${path}`)
}

