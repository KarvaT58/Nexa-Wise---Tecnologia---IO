export type EvolutionPlanCode = "basic" | "pro" | "master"

export type EvolutionConnectionStatus = "connected" | "qr_ready"

export type EvolutionWebhookStatus = "ready" | "paused" | "error"

export type EvolutionWhatsAppStats = {
  chats: number
  contacts: number
  groups: number
  unread: number
  totalMessages: number
  messagesSentToday: number
  messagesReceivedToday: number
  webhookEventsToday: number
  failedWebhooksToday: number
  latencyMs: number
  battery: number
  uptimeHours: number
  reconnects: number
}

export type EvolutionInstanceSettings = {
  rejectCall: boolean
  msgCall: string
  groupsIgnore: boolean
  alwaysOnline: boolean
  readMessages: boolean
  readStatus: boolean
  syncFullHistory: boolean
}

export type EvolutionWhatsAppSlot = {
  id: string
  slotNumber: number
  instanceName: string
  status: EvolutionConnectionStatus
  displayName: string
  phoneNumber?: string
  phoneJid?: string
  profileName?: string
  platform?: "Android" | "iOS" | "WhatsApp Web"
  connectedAt?: string
  lastSyncAt?: string
  qrCode?: string
  qrImage?: string
  pairingCode?: string
  qrGeneratedAt?: string
  qrExpiresAt?: string
  qrScans: number
  connectionState?: string
  stats?: EvolutionWhatsAppStats
}

export type EvolutionActivity = {
  id: string
  at: string
  title: string
  detail: string
  tone: "success" | "info" | "warning"
}

export type EvolutionIntegrationSnapshot = {
  mode: "local"
  engine: string
  baseUrl: string
  webhookStatus: EvolutionWebhookStatus
  sessionStore: "evolution"
  lastHealthCheckAt: string
  latencyMs: number
}

export type EvolutionWhatsAppSettings = {
  userId: string
  plan: EvolutionPlanCode
  slots: EvolutionWhatsAppSlot[]
  integration: EvolutionIntegrationSnapshot
  activity: EvolutionActivity[]
  createdAt: string
  updatedAt: string
}

export const EVOLUTION_PLAN_LIMITS: Record<
  EvolutionPlanCode,
  { label: string; phoneLimit: number; description: string }
> = {
  basic: {
    label: "Basico",
    phoneLimit: 2,
    description: "2 numeros",
  },
  pro: {
    label: "Pro",
    phoneLimit: 4,
    description: "4 numeros",
  },
  master: {
    label: "Master",
    phoneLimit: 6,
    description: "6 numeros",
  },
}

export function getConnectedSlots(settings: EvolutionWhatsAppSettings) {
  return settings.slots
    .filter((slot) => slot.status === "connected")
    .sort((left, right) => left.slotNumber - right.slotNumber)
}

export function getReadyQrSlot(settings: EvolutionWhatsAppSettings) {
  return settings.slots.find((slot) => slot.status === "qr_ready")
}

export function isEvolutionPlanCode(
  value: unknown
): value is EvolutionPlanCode {
  return value === "basic" || value === "pro" || value === "master"
}

export function createEvolutionCustomInstanceName(
  userId: string,
  instanceLabel: string,
  existingNames: Set<string>
) {
  const prefix = getEvolutionInstancePrefix(userId)
  const baseSlug = slugify(instanceLabel).slice(0, 40) || "whatsapp"
  let candidate = `${prefix}${baseSlug}`
  let suffix = 2

  while (existingNames.has(candidate)) {
    candidate = `${prefix}${baseSlug}_${suffix}`
    suffix += 1
  }

  return candidate
}

export function getEvolutionInstanceDisplayName(
  userId: string,
  instanceName: string,
  slotNumber: number
) {
  const prefix = getEvolutionInstancePrefix(userId)
  const rawName = instanceName.startsWith(prefix)
    ? instanceName.slice(prefix.length)
    : instanceName

  if (!rawName || /^\d+$/.test(rawName)) {
    return `WhatsApp ${String(slotNumber).padStart(2, "0")}`
  }

  return rawName
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function getEvolutionInstancePrefix(userId: string) {
  const userSlug = userId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24)

  return `nw_${userSlug || "usuario"}_wpp_`
}

export function makeEvolutionSlotId(userId: string, slotKey: number | string) {
  return `slot_${Math.abs(hashString(`${userId}-${slotKey}`)).toString(36)}`
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return hash
}
