import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process"

import {
  createEvolutionCustomInstanceName,
  EVOLUTION_PLAN_LIMITS,
  getEvolutionInstancePrefix,
  getEvolutionInstanceDisplayName,
  makeEvolutionSlotId,
  type EvolutionActivity,
  type EvolutionInstanceSettings,
  type EvolutionPlanCode,
  type EvolutionWhatsAppSettings,
  type EvolutionWhatsAppSlot,
  type EvolutionWhatsAppStats,
} from "@/lib/evolution-whatsapp-local-store"

type JsonRecord = Record<string, unknown>

type MatchedEvolutionInstance = {
  slotNumber: number
  name: string
  state: string
  record: JsonRecord
  createdAt?: string
  updatedAt?: string
}

type NormalizedEvolutionInstance = Omit<MatchedEvolutionInstance, "slotNumber">

type EvolutionQrResponse = {
  base64?: string
  code?: string
  count?: number
  pairingCode?: string
}

type EvolutionConfig = {
  baseUrl: string
  apiKey: string
}

type CommandResult = {
  stdout: string
  stderr: string
}

type EvolutionStatsCounts = {
  chats?: number
  contacts?: number
  groups?: number
  totalMessages?: number
}

export class EvolutionApiError extends Error {
  status: number
  detail?: string

  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = "EvolutionApiError"
    this.status = status
    this.detail = detail
  }
}

export class EvolutionConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvolutionConfigError"
  }
}

export class EvolutionPlanLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvolutionPlanLimitError"
  }
}

export class EvolutionValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvolutionValidationError"
  }
}

export async function getEvolutionWhatsAppSettings({
  userId,
  plan,
}: {
  userId: string
  plan: EvolutionPlanCode
}): Promise<EvolutionWhatsAppSettings> {
  const startedAt = Date.now()
  const now = new Date().toISOString()
  const config = getEvolutionConfig()
  const [health, fetchedInstances] = await Promise.all([
    fetchEvolutionHealth().catch(() => undefined),
    fetchEvolutionInstances(),
  ])
  const matchedInstances = await removeLegacyPendingInstances(
    userId,
    await matchUserInstances(userId, fetchedInstances)
  )
  const limit = EVOLUTION_PLAN_LIMITS[plan].phoneLimit
  const connectedInstances = matchedInstances
    .filter((instance) => isConnectedState(instance.state))
    .sort((left, right) => left.slotNumber - right.slotNumber)
    .slice(0, limit)
  const qrInstance = matchedInstances
    .filter((instance) => !isConnectedState(instance.state))
    .sort((left, right) => left.slotNumber - right.slotNumber)[0]

  const slots: EvolutionWhatsAppSlot[] = await Promise.all(
    connectedInstances.map((instance) => createConnectedSlot(userId, instance))
  )

  if (qrInstance && slots.length < limit) {
    slots.push(await createQrSlot(userId, qrInstance))
  }

  const sortedSlots = slots.sort((left, right) => left.slotNumber - right.slotNumber)
  const latencyMs = Math.max(1, Date.now() - startedAt)

  return {
    userId,
    plan,
    slots: sortedSlots,
    integration: {
      mode: "local",
      engine: readString(health, "version")
        ? `Evolution API ${readString(health, "version")}`
        : "Evolution API",
      baseUrl: config.baseUrl,
      webhookStatus: "ready",
      sessionStore: "evolution",
      lastHealthCheckAt: now,
      latencyMs,
    },
    activity: createActivity(sortedSlots, now),
    createdAt: now,
    updatedAt: now,
  }
}

export async function createEvolutionWhatsAppInstance({
  userId,
  plan,
  instanceLabel,
}: {
  userId: string
  plan: EvolutionPlanCode
  instanceLabel: string
}) {
  const label = instanceLabel.trim()

  if (!label) {
    throw new EvolutionValidationError("Informe um nome para a instancia.")
  }

  const fetchedInstances = await fetchEvolutionInstances()
  const matchedInstances = await removeLegacyPendingInstances(
    userId,
    await matchUserInstances(userId, fetchedInstances)
  )
  const limit = EVOLUTION_PLAN_LIMITS[plan].phoneLimit

  if (matchedInstances.length >= limit) {
    throw new EvolutionPlanLimitError(
      "Atualize seu plano para adicionar mais numeros de WhatsApp."
    )
  }

  const existingNames = new Set(
    fetchedInstances
      .map((instance) => readRemoteName(instance))
      .filter((name): name is string => Boolean(name))
  )
  const instanceName = createEvolutionCustomInstanceName(
    userId,
    label,
    existingNames
  )
  const createdInstance = await createEvolutionInstance(instanceName)
  const qrSlot = await createQrSlot(userId, {
    slotNumber: matchedInstances.length + 1,
    name: instanceName,
    state: readRemoteState(createdInstance) ?? "connecting",
    record: createdInstance,
    createdAt: readRemoteDate(createdInstance, "createdAt") ?? new Date().toISOString(),
    updatedAt: readRemoteDate(createdInstance, "updatedAt") ?? new Date().toISOString(),
  })
  const settings = await getEvolutionWhatsAppSettings({
    userId,
    plan,
  })

  return {
    settings: upsertSlot(settings, qrSlot),
    qrSlot,
  }
}

export async function renameEvolutionWhatsAppInstance({
  userId,
  plan,
  instanceName,
  instanceLabel,
}: {
  userId: string
  plan: EvolutionPlanCode
  instanceName: string
  instanceLabel: string
}) {
  const label = instanceLabel.trim()

  if (!label) {
    throw new EvolutionValidationError("Informe um nome para a instancia.")
  }

  const prefix = getEvolutionInstancePrefix(userId)

  if (!instanceName.startsWith(prefix)) {
    throw new EvolutionValidationError("Esta instancia nao pertence ao usuario.")
  }

  const fetchedInstances = await fetchEvolutionInstances()
  const currentInstance = fetchedInstances.find(
    (instance) => readRemoteName(instance) === instanceName
  )

  if (!currentInstance) {
    throw new EvolutionValidationError("Instancia da Evolution nao encontrada.")
  }

  const existingNames = new Set(
    fetchedInstances
      .map((instance) => readRemoteName(instance))
      .filter((name): name is string => Boolean(name && name !== instanceName))
  )
  const nextInstanceName = createEvolutionCustomInstanceName(
    userId,
    label,
    existingNames
  )

  if (nextInstanceName === instanceName) {
    return {
      settings: await getEvolutionWhatsAppSettings({ userId, plan }),
    }
  }

  await renameEvolutionInstanceInDatabase(instanceName, nextInstanceName)

  try {
    await restartEvolutionContainer()
    await waitForEvolutionApiReady()
    await waitForConnectionState(nextInstanceName).catch(() => undefined)
  } catch (error) {
    await renameEvolutionInstanceInDatabase(nextInstanceName, instanceName).catch(
      () => undefined
    )
    await restartEvolutionContainer().catch(() => undefined)
    await waitForEvolutionApiReady().catch(() => undefined)
    throw error
  }

  return {
    settings: await getEvolutionWhatsAppSettings({ userId, plan }),
  }
}

function upsertSlot(
  settings: EvolutionWhatsAppSettings,
  slot: EvolutionWhatsAppSlot
): EvolutionWhatsAppSettings {
  return {
    ...settings,
    slots: [
      ...settings.slots.filter((item) => item.instanceName !== slot.instanceName),
      slot,
    ].sort((left, right) => left.slotNumber - right.slotNumber),
  }
}

export async function refreshEvolutionWhatsAppQr(instanceName: string) {
  try {
    await evolutionRequest(`/instance/connect/${encodeURIComponent(instanceName)}`)
  } catch (error) {
    if (!(error instanceof EvolutionApiError) || error.status !== 404) {
      throw error
    }
  }
}

export async function findEvolutionInstanceSettings(instanceName: string) {
  const data = await evolutionRequest<unknown>(
    `/settings/find/${encodeURIComponent(instanceName)}`
  )

  return normalizeInstanceSettings(data)
}

export async function setEvolutionInstanceSettings(
  instanceName: string,
  settings: EvolutionInstanceSettings
) {
  const data = await evolutionRequest<unknown>(
    `/settings/set/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify(settings),
    }
  )

  return normalizeInstanceSettings(data)
}

export async function deleteEvolutionWhatsAppInstance(instanceName: string) {
  try {
    await evolutionRequest(`/instance/logout/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    })
  } catch (error) {
    if (!(error instanceof EvolutionApiError) || error.status !== 404) {
      throw error
    }
  }

  try {
    await evolutionRequest(`/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
    })
  } catch (error) {
    if (!(error instanceof EvolutionApiError) || error.status !== 404) {
      throw error
    }
  }
}

async function fetchEvolutionHealth() {
  return evolutionRequest<JsonRecord>("")
}

async function fetchEvolutionInstances() {
  const data = await evolutionRequest<unknown>("/instance/fetchInstances")

  if (Array.isArray(data)) {
    return data.filter(isRecord)
  }

  if (isRecord(data)) {
    const instances = data.instances

    if (Array.isArray(instances)) {
      return instances.filter(isRecord)
    }

    return [data]
  }

  return []
}

async function matchUserInstances(userId: string, instances: JsonRecord[]) {
  const prefix = getEvolutionInstancePrefix(userId)
  const matched = instances
    .map((record) => normalizeRemoteInstance(record))
    .filter((instance): instance is NormalizedEvolutionInstance => {
      return Boolean(instance?.name.startsWith(prefix))
    })
  const deduped = dedupeInstances(matched)
  const ordered = deduped
    .sort(compareInstances)
    .map((instance, index) => ({
      ...instance,
      slotNumber: index + 1,
    }))

  const withConnectionState = await Promise.all(
    ordered.map(async (instance) => {
      const connectionState = await fetchConnectionState(instance.name).catch(
        () => undefined
      )

      return {
        ...instance,
        state: connectionState ?? instance.state,
      }
    })
  )

  return dedupeInstances(withConnectionState).sort(
    (left, right) => left.slotNumber - right.slotNumber
  )
}

async function removeLegacyPendingInstances(
  userId: string,
  instances: MatchedEvolutionInstance[]
) {
  const legacyInstances = instances.filter(
    (instance) =>
      !isConnectedState(instance.state) &&
      isLegacyAutomaticInstanceName(userId, instance.name)
  )

  if (!legacyInstances.length) {
    return instances
  }

  await Promise.all(
    legacyInstances.map((instance) =>
      deleteEvolutionWhatsAppInstance(instance.name).catch(() => undefined)
    )
  )

  const legacyNames = new Set(legacyInstances.map((instance) => instance.name))

  return instances.filter((instance) => !legacyNames.has(instance.name))
}

function isLegacyAutomaticInstanceName(userId: string, instanceName: string) {
  const prefix = getEvolutionInstancePrefix(userId)

  if (!instanceName.startsWith(prefix)) {
    return false
  }

  return /^\d+$/.test(instanceName.slice(prefix.length))
}

function normalizeRemoteInstance(record: JsonRecord): NormalizedEvolutionInstance | undefined {
  const name = readRemoteName(record)

  if (!name) {
    return undefined
  }

  return {
    name,
    state: readRemoteState(record) ?? "close",
    record,
    createdAt: readRemoteDate(record, "createdAt"),
    updatedAt: readRemoteDate(record, "updatedAt"),
  } satisfies NormalizedEvolutionInstance
}

function dedupeInstances<T extends NormalizedEvolutionInstance>(
  instances: T[]
) {
  const byName = new Map<string, T>()

  for (const instance of instances) {
    const current = byName.get(instance.name)

    if (!current || shouldReplaceInstance(current, instance)) {
      byName.set(instance.name, instance)
    }
  }

  return [...byName.values()]
}

function shouldReplaceInstance(
  current: NormalizedEvolutionInstance,
  next: NormalizedEvolutionInstance
) {
  if (isConnectedState(next.state) && !isConnectedState(current.state)) {
    return true
  }

  const currentTime = Date.parse(current.updatedAt ?? current.createdAt ?? "")
  const nextTime = Date.parse(next.updatedAt ?? next.createdAt ?? "")

  return Number.isFinite(nextTime) && nextTime > (Number.isFinite(currentTime) ? currentTime : 0)
}

function compareInstances(
  left: NormalizedEvolutionInstance,
  right: NormalizedEvolutionInstance
) {
  const leftTime = Date.parse(left.createdAt ?? left.updatedAt ?? "")
  const rightTime = Date.parse(right.createdAt ?? right.updatedAt ?? "")

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime
  }

  return left.name.localeCompare(right.name)
}

async function fetchConnectionState(instanceName: string) {
  const data = await evolutionRequest<unknown>(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`
  )

  if (!isRecord(data)) {
    return undefined
  }

  const instance = readRecord(data, "instance")

  return (
    readString(instance, "state") ??
    readString(instance, "status") ??
    readString(data, "state") ??
    readString(data, "status")
  )
}

async function createEvolutionInstance(instanceName: string) {
  try {
    return await evolutionRequest<JsonRecord>("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        groupsIgnore: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      }),
    })
  } catch (error) {
    if (error instanceof EvolutionApiError && error.status === 403) {
      return {
        name: instanceName,
        connectionStatus: "connecting",
      }
    }

    throw error
  }
}

async function connectEvolutionInstance(instanceName: string) {
  const data = await evolutionRequest<unknown>(
    `/instance/connect/${encodeURIComponent(instanceName)}`
  )

  return isRecord(data) ? toQrResponse(data) : {}
}

async function createQrSlot(
  userId: string,
  instance: MatchedEvolutionInstance
): Promise<EvolutionWhatsAppSlot> {
  const generatedAt = new Date()
  const expiresAt = new Date(generatedAt.getTime() + 60 * 1000)
  const qr = await connectEvolutionInstance(instance.name)

  return {
    id: makeEvolutionSlotId(userId, instance.name),
    slotNumber: instance.slotNumber,
    instanceName: instance.name,
    status: "qr_ready",
    displayName: getEvolutionInstanceDisplayName(
      userId,
      instance.name,
      instance.slotNumber
    ),
    qrCode: qr.code,
    qrImage: normalizeQrImage(qr.base64),
    pairingCode: qr.pairingCode,
    qrGeneratedAt: generatedAt.toISOString(),
    qrExpiresAt: expiresAt.toISOString(),
    qrScans: qr.count ?? 0,
    connectionState: instance.state,
  }
}

async function createConnectedSlot(
  userId: string,
  instance: MatchedEvolutionInstance
): Promise<EvolutionWhatsAppSlot> {
  const record = instance.record
  const profileName = readRemoteProfileName(record)
  const phoneJid = readRemoteOwner(record)
  const phoneNumber =
    formatPhoneNumber(readRemoteNumber(record)) ?? formatJidPhoneNumber(phoneJid)
  const stats = await fetchEvolutionExactStats(instance.name, record)

  return {
    id: makeEvolutionSlotId(userId, instance.name),
    slotNumber: instance.slotNumber,
    instanceName: instance.name,
    status: "connected",
    displayName:
      getEvolutionInstanceDisplayName(userId, instance.name, instance.slotNumber) ||
      profileName ||
      "WhatsApp",
    phoneNumber,
    phoneJid,
    profileName,
    platform: "WhatsApp Web",
    connectedAt: instance.updatedAt ?? instance.createdAt,
    lastSyncAt: new Date().toISOString(),
    qrScans: 1,
    connectionState: instance.state,
    stats,
  }
}

async function fetchEvolutionExactStats(
  instanceName: string,
  record: JsonRecord
): Promise<EvolutionWhatsAppStats> {
  const recordStats = readRecordStats(record)
  const [databaseStats, runtimeStats] = await Promise.all([
    fetchEvolutionDatabaseStats(instanceName).catch(() => undefined),
    fetchEvolutionRuntimeStats(instanceName).catch(() => undefined),
  ])
  const groups = maxDefined(
    runtimeStats?.groups,
    databaseStats?.groups,
    recordStats.groups
  )
  const chats = maxDefined(
    runtimeStats?.chats,
    databaseStats?.chats,
    subtractGroupsFromUnknownChatCount(recordStats.chats, groups)
  )
  const contacts = maxDefined(
    runtimeStats?.contacts,
    databaseStats?.contacts,
    recordStats.contacts
  )
  const totalMessages = maxDefined(
    databaseStats?.totalMessages,
    recordStats.totalMessages,
    runtimeStats?.totalMessages
  )

  return createStats({
    chats,
    contacts,
    groups,
    totalMessages,
  })
}

async function fetchEvolutionRuntimeStats(
  instanceName: string
): Promise<EvolutionStatsCounts> {
  const [contacts, chats, groupCount] = await Promise.all([
    fetchEvolutionContactsCounts(instanceName).catch(() => undefined),
    fetchEvolutionChatsCounts(instanceName).catch(() => undefined),
    fetchEvolutionGroupCount(instanceName).catch(() => undefined),
  ])

  return {
    chats: chats?.chats,
    contacts: contacts?.contacts,
    groups: maxDefined(groupCount, chats?.groups, contacts?.groups),
    totalMessages: undefined,
  } satisfies EvolutionStatsCounts
}

async function fetchEvolutionContactsCounts(instanceName: string) {
  const contacts = await fetchEvolutionArray(
    `/chat/findContacts/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  )

  return countJidRows(contacts)
}

async function fetchEvolutionChatsCounts(instanceName: string) {
  const chats = await fetchEvolutionArray(
    `/chat/findChats/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  )

  return countJidRows(chats)
}

async function fetchEvolutionGroupCount(instanceName: string) {
  try {
    const data = await evolutionRequest<unknown>(
      `/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`
    )

    if (Array.isArray(data)) {
      return data.length
    }

    if (isRecord(data) && Array.isArray(data.groups)) {
      return data.groups.length
    }
  } catch (error) {
    if (!(error instanceof EvolutionApiError)) {
      throw error
    }
  }

  return 0
}

async function fetchEvolutionDatabaseStats(instanceName: string) {
  const postgresContainer =
    process.env.EVOLUTION_POSTGRES_CONTAINER || "evo_postgres"
  const postgresUser = process.env.EVOLUTION_POSTGRES_USER || "evolution"
  const postgresDatabase =
    process.env.EVOLUTION_POSTGRES_DATABASE || "evolution"
  const sql = `
SELECT
  COALESCE((
    SELECT COUNT(*)
    FROM "Chat" chat
    WHERE chat."instanceId" = instance.id
      AND chat."remoteJid" NOT LIKE '%@g.us'
      AND chat."remoteJid" <> 'status@broadcast'
  ), 0) AS chats,
  GREATEST(
    COALESCE((
      SELECT COUNT(*)
      FROM "Chat" chat
      WHERE chat."instanceId" = instance.id
        AND chat."remoteJid" LIKE '%@g.us'
    ), 0),
    COALESCE((
      SELECT COUNT(*)
      FROM "Contact" contact
      WHERE contact."instanceId" = instance.id
        AND contact."remoteJid" LIKE '%@g.us'
    ), 0)
  ) AS groups,
  COALESCE((
    SELECT COUNT(*)
    FROM "Contact" contact
    WHERE contact."instanceId" = instance.id
      AND contact."remoteJid" NOT LIKE '%@g.us'
      AND contact."remoteJid" <> 'status@broadcast'
  ), 0) AS contacts,
  COALESCE((
    SELECT COUNT(*)
    FROM "Message" message
    WHERE message."instanceId" = instance.id
  ), 0) AS messages
FROM "Instance" instance
WHERE instance.name = ${quoteSqlLiteral(instanceName)}
LIMIT 1;
`
  const result = await runCommand(
    "docker",
    [
      "exec",
      "-i",
      postgresContainer,
      "psql",
      "-U",
      postgresUser,
      "-d",
      postgresDatabase,
      "-t",
      "-A",
      "-F",
      "|",
    ],
    sql,
    15_000
  )
  const [line] = result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!line) {
    return undefined
  }

  const [chats, groups, contacts, messages] = line.split("|")

  return {
    chats: parseCount(chats),
    groups: parseCount(groups),
    contacts: parseCount(contacts),
    totalMessages: parseCount(messages),
  } satisfies EvolutionStatsCounts
}

async function fetchEvolutionArray(pathName: string, init?: RequestInit) {
  const data = await evolutionRequest<unknown>(pathName, init)

  if (Array.isArray(data)) {
    return data.filter(isRecord)
  }

  if (isRecord(data)) {
    const values =
      readArray(data, "contacts") ??
      readArray(data, "chats") ??
      readArray(data, "groups") ??
      readArray(data, "data")

    return values?.filter(isRecord) ?? []
  }

  return []
}

function countJidRows(rows: JsonRecord[]) {
  let chats = 0
  let groups = 0
  let contacts = 0

  for (const row of rows) {
    const remoteJid =
      readString(row, "remoteJid") ??
      readString(row, "jid") ??
      readString(row, "id")
    const isGroup =
      readBoolean(row, "isGroup") ??
      Boolean(remoteJid?.includes("@g.us")) ??
      false

    if (!remoteJid || remoteJid === "status@broadcast") {
      continue
    }

    if (isGroup) {
      groups += 1
      continue
    }

    if (remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid")) {
      contacts += 1
      chats += 1
    }
  }

  return {
    chats,
    contacts,
    groups,
  }
}

function readRecordStats(record: JsonRecord): EvolutionStatsCounts {
  const count = readRecord(record, "_count") ?? readRecord(readRecord(record, "instance"), "_count")

  return {
    chats: readNumber(count, "Chat") ?? readNumber(count, "chats"),
    contacts: readNumber(count, "Contact") ?? readNumber(count, "contacts"),
    groups: readNumber(count, "Group") ?? readNumber(count, "groups"),
    totalMessages:
      readNumber(count, "Message") ?? readNumber(count, "messages"),
  }
}

function createStats(counts: Required<EvolutionStatsCounts>): EvolutionWhatsAppStats {
  return {
    chats: counts.chats,
    contacts: counts.contacts,
    groups: counts.groups,
    unread: 0,
    totalMessages: counts.totalMessages,
    messagesSentToday: 0,
    messagesReceivedToday: 0,
    webhookEventsToday: 0,
    failedWebhooksToday: 0,
    latencyMs: 0,
    battery: 100,
    uptimeHours: 0,
    reconnects: 0,
  }
}

function maxDefined(...values: Array<number | undefined>) {
  const numericValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  )

  return numericValues.length ? Math.max(...numericValues) : 0
}

function subtractGroupsFromUnknownChatCount(
  chats: number | undefined,
  groups: number
) {
  if (typeof chats !== "number") {
    return undefined
  }

  return groups > 0 ? Math.max(0, chats - groups) : chats
}

function parseCount(value: string | undefined) {
  const count = Number(value)

  return Number.isFinite(count) ? count : 0
}

function createActivity(slots: EvolutionWhatsAppSlot[], now: string) {
  const activity: EvolutionActivity[] = []
  const qrSlot = slots.find((slot) => slot.status === "qr_ready")
  const connectedSlots = slots.filter((slot) => slot.status === "connected")

  if (qrSlot) {
    activity.push({
      id: `activity_qr_${qrSlot.slotNumber}`,
      at: now,
      title: "QR real preparado",
      detail: `${qrSlot.instanceName} esta aguardando leitura pelo WhatsApp.`,
      tone: "info",
    })
  }

  for (const slot of connectedSlots.slice(0, 4)) {
    activity.push({
      id: `activity_connected_${slot.slotNumber}`,
      at: slot.connectedAt ?? now,
      title: "Numero conectado",
      detail: `${slot.displayName} esta ativo na instancia ${slot.instanceName}.`,
      tone: "success",
    })
  }

  if (!activity.length) {
    activity.push({
      id: "activity_empty",
      at: now,
      title: "Aguardando instancia",
      detail: "A Evolution ainda nao possui instancias desse usuario.",
      tone: "warning",
    })
  }

  return activity.slice(0, 8)
}

async function renameEvolutionInstanceInDatabase(
  currentInstanceName: string,
  nextInstanceName: string
) {
  const postgresContainer =
    process.env.EVOLUTION_POSTGRES_CONTAINER || "evo_postgres"
  const postgresUser = process.env.EVOLUTION_POSTGRES_USER || "evolution"
  const postgresDatabase =
    process.env.EVOLUTION_POSTGRES_DATABASE || "evolution"
  const sql = `
UPDATE "Instance"
SET name = ${quoteSqlLiteral(nextInstanceName)}, "updatedAt" = NOW()
WHERE name = ${quoteSqlLiteral(currentInstanceName)};
`

  try {
    await runCommand(
      "docker",
      [
        "exec",
        "-i",
        postgresContainer,
        "psql",
        "-U",
        postgresUser,
        "-d",
        postgresDatabase,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      sql,
      15_000
    )
  } catch (error) {
    throw new EvolutionApiError(
      "Nao foi possivel renomear a instancia no banco da Evolution.",
      502,
      getCommandErrorDetail(error)
    )
  }
}

async function restartEvolutionContainer() {
  const evolutionContainer =
    process.env.EVOLUTION_CONTAINER_NAME || "local_evolution"

  try {
    await runCommand("docker", ["restart", evolutionContainer], undefined, 30_000)
  } catch (error) {
    throw new EvolutionApiError(
      "A instancia foi renomeada, mas nao foi possivel reiniciar a Evolution.",
      502,
      getCommandErrorDetail(error)
    )
  }
}

async function waitForEvolutionApiReady() {
  const timeoutAt = Date.now() + 30_000
  let lastError: unknown

  while (Date.now() < timeoutAt) {
    try {
      await fetchEvolutionInstances()
      return
    } catch (error) {
      lastError = error
      await sleep(1_000)
    }
  }

  throw new EvolutionApiError(
    "A Evolution demorou para voltar depois da renomeacao.",
    504,
    getCommandErrorDetail(lastError)
  )
}

async function waitForConnectionState(instanceName: string) {
  const timeoutAt = Date.now() + 30_000

  while (Date.now() < timeoutAt) {
    const state = await fetchConnectionState(instanceName).catch(() => undefined)

    if (isConnectedState(state)) {
      return
    }

    await sleep(1_000)
  }
}

function runCommand(
  command: string,
  args: string[],
  input?: string,
  timeoutMs = 10_000
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ""
    let stderr = ""
    let settled = false

    const settle = () => {
      if (settled) {
        return false
      }

      settled = true
      clearTimeout(timer)
      return true
    }

    const timer = setTimeout(() => {
      if (!settle()) {
        return
      }

      child.kill()
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`))
    }, timeoutMs)

    collectChildOutput(child, {
      onStdout: (chunk) => {
        stdout += chunk
      },
      onStderr: (chunk) => {
        stderr += chunk
      },
    })

    child.on("error", (error) => {
      if (settle()) {
        reject(error)
      }
    })
    child.on("close", (code) => {
      if (!settle()) {
        return
      }

      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(stderr.trim() || stdout.trim() || `Command exited ${code}`)
      )
    })

    if (input) {
      child.stdin.write(input)
    }

    child.stdin.end()
  })
}

function collectChildOutput(
  child: ChildProcessWithoutNullStreams,
  handlers: {
    onStdout: (chunk: string) => void
    onStderr: (chunk: string) => void
  }
) {
  child.stdout.on("data", (data: Buffer) => {
    handlers.onStdout(data.toString())
  })
  child.stderr.on("data", (data: Buffer) => {
    handlers.onStderr(data.toString())
  })
}

function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function getCommandErrorDetail(error: unknown) {
  if (error instanceof EvolutionApiError) {
    return error.detail ?? error.message
  }

  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function evolutionRequest<T = unknown>(path: string, init: RequestInit = {}) {
  const config = getEvolutionConfig()
  const headers = new Headers(init.headers)

  headers.set("apikey", config.apiKey)

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })
  const responseText = await response.text()

  if (!response.ok) {
    throw new EvolutionApiError(
      `Evolution API returned ${response.status}`,
      response.status,
      responseText
    )
  }

  if (!responseText) {
    return undefined as T
  }

  return JSON.parse(responseText) as T
}

function getEvolutionConfig(): EvolutionConfig {
  const baseUrl = (
    process.env.EVOLUTION_API_URL ||
    process.env.NEXT_PRIVATE_EVOLUTION_API_URL ||
    "http://localhost:8080"
  ).replace(/\/+$/, "")
  const apiKey =
    process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || ""

  if (!apiKey) {
    throw new EvolutionConfigError(
      "Configure EVOLUTION_API_KEY in .env.local to connect Evolution API."
    )
  }

  return {
    baseUrl,
    apiKey,
  }
}

function toQrResponse(record: JsonRecord): EvolutionQrResponse {
  return {
    base64: readString(record, "base64"),
    code: readString(record, "code"),
    count: readNumber(record, "count"),
    pairingCode: readString(record, "pairingCode"),
  }
}

function normalizeInstanceSettings(value: unknown): EvolutionInstanceSettings {
  const settingsWrapper = readRecord(value, "settings")
  const settings =
    readRecord(settingsWrapper, "settings") ?? settingsWrapper ?? value

  return {
    rejectCall:
      readBoolean(settings, "rejectCall") ??
      readBoolean(settings, "reject_call") ??
      false,
    msgCall:
      readString(settings, "msgCall") ?? readString(settings, "msg_call") ?? "",
    groupsIgnore:
      readBoolean(settings, "groupsIgnore") ??
      readBoolean(settings, "groups_ignore") ??
      false,
    alwaysOnline:
      readBoolean(settings, "alwaysOnline") ??
      readBoolean(settings, "always_online") ??
      false,
    readMessages:
      readBoolean(settings, "readMessages") ??
      readBoolean(settings, "read_messages") ??
      false,
    readStatus:
      readBoolean(settings, "readStatus") ??
      readBoolean(settings, "read_status") ??
      false,
    syncFullHistory:
      readBoolean(settings, "syncFullHistory") ??
      readBoolean(settings, "sync_full_history") ??
      false,
  }
}

function normalizeQrImage(base64?: string) {
  if (!base64) {
    return undefined
  }

  if (base64.startsWith("data:image")) {
    return base64
  }

  return `data:image/png;base64,${base64}`
}

function readRemoteName(record: JsonRecord) {
  const instance = readRecord(record, "instance")

  return (
    readString(record, "name") ??
    readString(record, "instanceName") ??
    readString(instance, "instanceName") ??
    readString(instance, "name")
  )
}

function readRemoteState(record: JsonRecord) {
  const instance = readRecord(record, "instance")
  const connectionStatus = readConnectionValue(record.connectionStatus)
  const instanceConnectionStatus = readConnectionValue(instance?.connectionStatus)

  return (
    connectionStatus ??
    instanceConnectionStatus ??
    readString(record, "status") ??
    readString(instance, "status") ??
    readString(record, "state") ??
    readString(instance, "state")
  )
}

function readRemoteDate(record: JsonRecord, key: "createdAt" | "updatedAt") {
  const instance = readRecord(record, "instance")

  return readString(record, key) ?? readString(instance, key)
}

function readRemoteOwner(record: JsonRecord) {
  const instance = readRecord(record, "instance")

  return (
    readString(record, "ownerJid") ??
    readString(record, "owner") ??
    readString(instance, "owner") ??
    readString(instance, "ownerJid")
  )
}

function readRemoteNumber(record: JsonRecord) {
  const instance = readRecord(record, "instance")

  return (
    readString(record, "number") ??
    readString(instance, "number") ??
    readString(instance, "owner")
  )
}

function readRemoteProfileName(record: JsonRecord) {
  const instance = readRecord(record, "instance")

  return readString(record, "profileName") ?? readString(instance, "profileName")
}

function readConnectionValue(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  if (!isRecord(value)) {
    return undefined
  }

  return readString(value, "state") ?? readString(value, "status")
}

function isConnectedState(state?: string) {
  return state === "open" || state === "connected"
}

function formatJidPhoneNumber(jid?: string) {
  if (!jid) {
    return undefined
  }

  return formatPhoneNumber(jid.split("@")[0])
}

function formatPhoneNumber(value?: string) {
  const digits = value?.replace(/\D/g, "")

  if (!digits) {
    return undefined
  }

  if (digits.startsWith("55") && digits.length >= 12) {
    const country = digits.slice(0, 2)
    const area = digits.slice(2, 4)
    const body = digits.slice(4, -4)
    const suffix = digits.slice(-4)

    return `+${country} ${area} ${body}-${suffix}`
  }

  return `+${digits}`
}

function readRecord(record: unknown, key: string) {
  if (!isRecord(record)) {
    return undefined
  }

  const value = record[key]

  return isRecord(value) ? value : undefined
}

function readArray(record: unknown, key: string) {
  if (!isRecord(record)) {
    return undefined
  }

  const value = record[key]

  return Array.isArray(value) ? value : undefined
}

function readString(record: unknown, key: string) {
  if (!isRecord(record)) {
    return undefined
  }

  const value = record[key]

  return typeof value === "string" ? value : undefined
}

function readNumber(record: unknown, key: string) {
  if (!isRecord(record)) {
    return undefined
  }

  const value = record[key]

  return typeof value === "number" ? value : undefined
}

function readBoolean(record: unknown, key: string) {
  if (!isRecord(record)) {
    return undefined
  }

  const value = record[key]

  return typeof value === "boolean" ? value : undefined
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
