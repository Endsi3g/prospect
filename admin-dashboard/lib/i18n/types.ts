export type Locale = "fr" | "en"

export interface Messages {
  appName: string
  locale: {
    switchAriaLabel: string
  }
  sidebar: {
    mainMenu: string
    pilotage: string
    analysis: string
    support: string
    resources: string
    dashboard: string
    tasks: string
    leads: string
    opportunities: string
    analytics: string
    projects: string
    campaigns: string
    systems: string
    research: string
    assistantAi: string
    settings: string
    team: string
    dev: string
    getHelp: string
    search: string
    quickLead: string
    library: string
    reports: string
    badgeNew: string
    badgeLive: string
    badgeSource: string
    badgeEffectiveDate: string
    badgeNewHint: string
    badgeLiveHint: string
    userFallbackName: string
    userFallbackEmail: string
    toggleSidebar: string
  }
  header: {
    search: string
    help: string
    settings: string
    titleDefault: string
    titleLeadDetail: string
    titleProjectDetail: string
    titleTaskDetail: string
    titles: {
      dashboard: string
      leads: string
      tasks: string
      analytics: string
      projects: string
      campaigns: string
      research: string
      systems: string
      settings: string
      settingsTeam: string
      help: string
      library: string
      reports: string
      assistant: string
      account: string
      billing: string
      notifications: string
    }
  }
  userMenu: {
    account: string
    billing: string
    notifications: string
    logout: string
  }
  auth: {
    login: {
      title: string
      description: string
      usernameLabel: string
      passwordLabel: string
      submit: string
      submitting: string
      successToast: string
      invalidCredentials: string
      genericError: string
    }
  }
  dashboard: {
    page: {
      errorTitle: string
      errorDescriptionTimeout: string
      errorDescriptionDefault: string
      secondaryLabel: string
    }
    sync: {
      stalePrefix: string
      staleNoSync: string
      refresh: string
      refreshing: string
      upToDatePrefix: string
      pending: string
      toastSuccess: string
      toastError: string
      sourceLabel: string
      sourceApi: string
      sourceFallback: string
      sourceUnknown: string
      fallbackModeActive: string
      fallbackBadge: string
    }
    stats: {
      sourcedLeads: string
      activeBase: string
      qualifiedLeads: string
      qualificationRate: string
      contactedLeads: string
      contactRate: string
      wonOpportunities: string
      winRate: string
    }
    chart: {
      title: string
      subtitle: string
      subtitleShort: string
      range90d: string
      range30d: string
      range7d: string
      rangeSelectAriaLabel: string
      legend: string
      emptyState: string
      srDescription: string
      summaryPrefix: string
      summaryEmpty: string
      summaryPeriod: string
      summaryCreatedTotal: string
      summaryContactedTotal: string
      summaryCreatedMin: string
      summaryCreatedMax: string
      seriesCreated: string
      seriesContacted: string
    }
  }
  addLead: {
    quickButtonAria: string
  }
}
