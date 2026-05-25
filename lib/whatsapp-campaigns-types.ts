import {
  type EvolutionContact,
  type EvolutionContactInstance,
} from "@/lib/evolution-contacts-types"

export type WhatsAppCampaignStatusCode =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED"

export type WhatsAppCampaignMessageTypeCode =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "DOCUMENT"

export type WhatsAppCampaignAudienceModeCode = "ALL" | "FILTER" | "CUSTOM"

export type WhatsAppCampaignJobStatusCode =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED"
  | "CANCELED"

export type WhatsAppCampaignMediaDraft = {
  media: string
  mimetype: string
  fileName: string
}

export type WhatsAppCampaignMessageDraft = {
  id?: string
  type: WhatsAppCampaignMessageTypeCode
  text: string
  caption?: string
  attachments?: WhatsAppCampaignMediaDraft[]
  media?: string
  mimetype?: string
  fileName?: string
  textAfterMedia?: boolean
}

export type WhatsAppCampaignInput = {
  id?: string
  name: string
  audienceMode: WhatsAppCampaignAudienceModeCode
  selectedInstanceNames: string[]
  includedLabels: string[]
  excludedLabels: string[]
  selectedContactIds: string[]
  minDelaySeconds: number
  maxDelaySeconds: number
  dailyLimit: number
  scheduledAt?: string | null
  recurring: boolean
  recurrenceDays: string[]
  recurrenceTime?: string | null
  timezone: string
  optOutText: string
  safetyMaxErrors: number
  messages: WhatsAppCampaignMessageDraft[]
}

export type WhatsAppCampaignJobSummary = {
  pending: number
  sending: number
  sent: number
  read: number
  failed: number
  skipped: number
  canceled: number
  total: number
}

export type WhatsAppCampaignJobItem = {
  id: string
  contactName: string
  contactNumber: string
  instanceDisplayName: string
  status: WhatsAppCampaignJobStatusCode
  scheduledAt: string
  sentAt?: string | null
  readAt?: string | null
  lastError?: string | null
}

export type WhatsAppCampaignEventItem = {
  id: string
  type: string
  message: string
  createdAt: string
}

export type WhatsAppCampaignItem = {
  id: string
  name: string
  status: WhatsAppCampaignStatusCode
  audienceMode: WhatsAppCampaignAudienceModeCode
  selectedInstanceNames: string[]
  includedLabels: string[]
  excludedLabels: string[]
  selectedContactIds: string[]
  minDelaySeconds: number
  maxDelaySeconds: number
  dailyLimit: number
  scheduledAt?: string | null
  recurring: boolean
  recurrenceDays: string[]
  recurrenceTime?: string | null
  timezone: string
  optOutText: string
  safetyMaxErrors: number
  preparedAt?: string | null
  startedAt?: string | null
  pausedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
  messages: WhatsAppCampaignMessageDraft[]
  jobs: WhatsAppCampaignJobItem[]
  events: WhatsAppCampaignEventItem[]
  jobSummary: WhatsAppCampaignJobSummary
}

export type WhatsAppCampaignSnapshot = {
  campaigns: WhatsAppCampaignItem[]
  contacts: EvolutionContact[]
  instances: EvolutionContactInstance[]
  labels: string[]
  totals: {
    campaigns: number
    contacts: number
    scheduled: number
    running: number
    pendingJobs: number
    sentJobs: number
    failedJobs: number
  }
  updatedAt: string
}

export type WhatsAppCampaignActionResult = {
  snapshot: WhatsAppCampaignSnapshot
  campaign?: WhatsAppCampaignItem
  prepared?: {
    total: number
    skippedOptOut: number
  }
  processed?: {
    sent: number
    failed: number
    skipped: number
  }
}
