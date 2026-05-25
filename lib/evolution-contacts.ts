import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  getEvolutionInstanceDisplayName,
  getEvolutionInstancePrefix,
} from "@/lib/evolution-whatsapp-local-store"
import {
  type EvolutionContact,
  type EvolutionContactImportResult,
  type EvolutionContactImportRow,
  type EvolutionContactInstance,
  type EvolutionContactsSnapshot,
  type EvolutionContactSource,
} from "@/lib/evolution-contacts-types"

type JsonRecord = Record<string, unknown>

type EvolutionConfig = {
  baseUrl: string
  apiKey: string
}

type StoredContact = {
  id: string
  instanceName: string
  number: string
  name: string
  labels: string[]
  blocked: boolean
  reported: boolean
  source: EvolutionContactSource
  createdAt: string
  updatedAt: string
}

type ContactStore = {
  contacts: Record<string, StoredContact>
  labels: string[]
}

type ContactActionResult = {
  snapshot: EvolutionContactsSnapshot
  importResult?: EvolutionContactImportResult
}

type DatabaseContactNameRow = {
  instanceName: string
  name?: string | null
  remoteJid: string
  updatedAt?: string | null
}

const DEFAULT_LABELS = ["Cliente", "Lead", "VIP", "Fornecedor"]
const STORE_PATH = path.join(
  process.cwd(),
  ".nexawise",
  "evolution-contacts.json"
)

export class EvolutionContactError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "EvolutionContactError"
    this.status = status
  }
}

export async function getEvolutionContactsSnapshot({
  userId,
}: {
  userId: string
}): Promise<EvolutionContactsSnapshot> {
  const [store, remoteInstances] = await Promise.all([
    readContactStore(),
    fetchConnectedInstances(userId),
  ])
  const contactsById = new Map<string, EvolutionContact>()
  const contactsByInstance = await Promise.all(
    remoteInstances.map(async (instance) => {
      const [contacts, savedNames] = await Promise.all([
        fetchInstanceContacts(instance.instanceName).catch(() => []),
        fetchInstanceSavedContactNames(instance.instanceName).catch(
          () => new Map<string, DatabaseContactNameRow>()
        ),
      ])

      return contacts.map((contact) =>
        normalizeRemoteContact(
          contact,
          instance,
          store,
          savedNames.get(readString(contact, "remoteJid") ?? "")
        )
      )
    })
  )

  for (const contact of contactsByInstance.flat()) {
    contactsById.set(contact.id, contact)
  }

  for (const storedContact of Object.values(store.contacts)) {
    if (contactsById.has(storedContact.id)) {
      continue
    }

    const instance = remoteInstances.find(
      (item) => item.instanceName === storedContact.instanceName
    )

    if (!instance) {
      continue
    }

    contactsById.set(storedContact.id, createStoredContact(storedContact, instance))
  }

  const contacts = [...contactsById.values()].sort(compareContacts)
  const labels = normalizeLabels([
    ...DEFAULT_LABELS,
    ...store.labels,
    ...contacts.flatMap((contact) => contact.labels),
  ])

  return {
    instances: remoteInstances,
    contacts,
    labels,
    totals: {
      contacts: contacts.length,
      instances: remoteInstances.length,
      blocked: contacts.filter((contact) => contact.blocked).length,
      reported: contacts.filter((contact) => contact.reported).length,
      labels: labels.length,
    },
    updatedAt: new Date().toISOString(),
  }
}

export async function addEvolutionContact({
  userId,
  instanceName,
  name,
  number,
  labels,
}: {
  userId: string
  instanceName: string
  name: string
  number: string
  labels: string[]
}): Promise<ContactActionResult> {
  const store = await readContactStore()
  const snapshot = await getEvolutionContactsSnapshot({ userId })
  const instance = requireInstance(snapshot, instanceName)
  const normalizedNumber = normalizePhone(number)
  const normalizedName = normalizeName(name)

  if (!normalizedName) {
    throw new EvolutionContactError("Informe o nome do contato.")
  }

  if (!normalizedNumber) {
    throw new EvolutionContactError("Informe um numero valido.")
  }

  assertNoDuplicate(snapshot.contacts, {
    instanceName: instance.instanceName,
    number: normalizedNumber,
    name,
  })

  const now = new Date().toISOString()
  const id = makeContactId(instance.instanceName, normalizedNumber)

  store.contacts[id] = {
    id,
    instanceName: instance.instanceName,
    number: normalizedNumber,
    name: name.trim(),
    labels: normalizeLabels(labels),
    blocked: false,
    reported: false,
    source: "manual",
    createdAt: now,
    updatedAt: now,
  }
  store.labels = normalizeLabels([...store.labels, ...labels])
  await writeContactStore(store)

  return {
    snapshot: await getEvolutionContactsSnapshot({ userId }),
  }
}

export async function updateEvolutionContact({
  userId,
  contactId,
  name,
  labels,
}: {
  userId: string
  contactId: string
  name: string
  labels: string[]
}): Promise<ContactActionResult> {
  const store = await readContactStore()
  const snapshot = await getEvolutionContactsSnapshot({ userId })
  const current = requireContact(snapshot, contactId)
  const normalizedName = normalizeName(name)

  if (!normalizedName) {
    throw new EvolutionContactError("Informe o nome do contato.")
  }

  assertNoDuplicate(snapshot.contacts, {
    instanceName: current.instanceName,
    number: current.number,
    name,
    ignoreId: contactId,
  })

  const stored = toStoredContact(current)
  const nextLabels = normalizeLabels(labels)

  store.contacts[contactId] = {
    ...stored,
    name: name.trim(),
    labels: nextLabels,
    updatedAt: new Date().toISOString(),
  }
  store.labels = normalizeLabels([...store.labels, ...nextLabels])
  await writeContactStore(store)

  return {
    snapshot: await getEvolutionContactsSnapshot({ userId }),
  }
}

export async function setEvolutionContactLabels({
  userId,
  contactId,
  labels,
}: {
  userId: string
  contactId: string
  labels: string[]
}): Promise<ContactActionResult> {
  const store = await readContactStore()
  const snapshot = await getEvolutionContactsSnapshot({ userId })
  const current = requireContact(snapshot, contactId)
  const nextLabels = normalizeLabels(labels)

  store.contacts[contactId] = {
    ...toStoredContact(current),
    labels: nextLabels,
    updatedAt: new Date().toISOString(),
  }
  store.labels = normalizeLabels([...store.labels, ...nextLabels])
  await writeContactStore(store)

  return {
    snapshot: await getEvolutionContactsSnapshot({ userId }),
  }
}

export async function setEvolutionContactFlag({
  userId,
  contactId,
  field,
  value,
}: {
  userId: string
  contactId: string
  field: "blocked" | "reported"
  value: boolean
}): Promise<ContactActionResult> {
  const store = await readContactStore()
  const snapshot = await getEvolutionContactsSnapshot({ userId })
  const current = requireContact(snapshot, contactId)

  store.contacts[contactId] = {
    ...toStoredContact(current),
    [field]: value,
    updatedAt: new Date().toISOString(),
  }
  await writeContactStore(store)

  return {
    snapshot: await getEvolutionContactsSnapshot({ userId }),
  }
}

export async function importEvolutionContacts({
  userId,
  fallbackInstanceName,
  rows,
}: {
  userId: string
  fallbackInstanceName: string
  rows: EvolutionContactImportRow[]
}): Promise<ContactActionResult> {
  const store = await readContactStore()
  const snapshot = await getEvolutionContactsSnapshot({ userId })
  const contacts = [...snapshot.contacts]
  const now = new Date().toISOString()
  const result: EvolutionContactImportResult = {
    added: 0,
    discarded: 0,
    duplicates: 0,
    invalid: 0,
    errors: [],
  }

  for (const [index, row] of rows.entries()) {
    const instance = resolveImportInstance(
      snapshot.instances,
      row.instanceName || fallbackInstanceName
    )
    const number = normalizePhone(row.number)
    const name = row.name.trim()

    if (!instance || !number || !name) {
      result.discarded += 1
      result.invalid += 1
      result.errors.push(`Linha ${index + 2}: contato invalido.`)
      continue
    }

    if (
      hasDuplicate(contacts, {
        instanceName: instance.instanceName,
        number,
        name,
      })
    ) {
      result.discarded += 1
      result.duplicates += 1
      continue
    }

    const id = makeContactId(instance.instanceName, number)
    const labels = normalizeLabels(row.labels ?? [])
    const stored: StoredContact = {
      id,
      instanceName: instance.instanceName,
      number,
      name,
      labels,
      blocked: false,
      reported: false,
      source: "import",
      createdAt: now,
      updatedAt: now,
    }

    store.contacts[id] = stored
    contacts.push(createStoredContact(stored, instance))
    store.labels = normalizeLabels([...store.labels, ...labels])
    result.added += 1
  }

  await writeContactStore(store)

  return {
    snapshot: await getEvolutionContactsSnapshot({ userId }),
    importResult: result,
  }
}

async function fetchConnectedInstances(userId: string) {
  const data = await evolutionRequest<unknown>("/instance/fetchInstances")
  const records = Array.isArray(data)
    ? data.filter(isRecord)
    : isRecord(data)
      ? [data]
      : []
  const connected = records.filter((record) =>
    isConnectedState(readString(record, "connectionStatus"))
  )
  const prefix = getEvolutionInstancePrefix(userId)
  const hasUserInstances = connected.some((record) =>
    (readString(record, "name") ?? "").startsWith(prefix)
  )
  const filtered = hasUserInstances
    ? connected.filter((record) => (readString(record, "name") ?? "").startsWith(prefix))
    : connected

  return filtered
    .map((record, index) => normalizeInstance(record, userId, index + 1))
    .filter((instance): instance is EvolutionContactInstance => Boolean(instance))
}

async function fetchInstanceContacts(instanceName: string) {
  const data = await evolutionRequest<unknown>(
    `/chat/findContacts/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  )

  if (!Array.isArray(data)) {
    return []
  }

  return data.filter(isRecord).filter((record) => {
    const remoteJid = readString(record, "remoteJid")

    return (
      !readBoolean(record, "isGroup") &&
      typeof remoteJid === "string" &&
      remoteJid !== "status@broadcast" &&
      isPhoneContactJid(remoteJid)
    )
  })
}

async function fetchInstanceSavedContactNames(instanceName: string) {
  const rows = await runEvolutionJsonQuery<DatabaseContactNameRow>(`
SELECT
  inst.name AS "instanceName",
  chat."remoteJid",
  chat.name,
  chat."updatedAt"
FROM "Chat" chat
JOIN "Instance" inst ON inst.id = chat."instanceId"
WHERE inst.name = ${quoteSqlLiteral(instanceName)}
  AND chat."remoteJid" <> 'status@broadcast'
  AND chat."remoteJid" NOT LIKE '%@g.us'
  AND chat.name IS NOT NULL
  AND trim(chat.name) <> ''
`)
  const names = new Map<string, DatabaseContactNameRow>()

  for (const row of rows) {
    names.set(row.remoteJid, row)
  }

  return names
}

async function evolutionRequest<T = unknown>(
  pathName: string,
  init: RequestInit = {}
) {
  const config = getEvolutionConfig()
  const headers = new Headers(init.headers)

  headers.set("apikey", config.apiKey)

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${config.baseUrl}${pathName}`, {
    ...init,
    headers,
    cache: "no-store",
  })
  const responseText = await response.text()

  if (!response.ok) {
    throw new EvolutionContactError(
      `Evolution API retornou ${response.status}.`,
      response.status || 502
    )
  }

  if (!responseText) {
    return undefined as T
  }

  return JSON.parse(responseText) as T
}

function normalizeInstance(
  record: JsonRecord,
  userId: string,
  slotNumber: number
): EvolutionContactInstance | null {
  const instanceName = readString(record, "name")

  if (!instanceName) {
    return null
  }

  const ownerJid = readString(record, "ownerJid")
  const instance: EvolutionContactInstance = {
    instanceName,
    displayName: getEvolutionInstanceDisplayName(
      userId,
      instanceName,
      slotNumber
    ),
    status: readString(record, "connectionStatus") ?? "open",
  }

  if (ownerJid) {
    instance.phoneNumber = formatPhoneNumber(ownerJid.split("@")[0])
  }

  return instance
}

function normalizeRemoteContact(
  record: JsonRecord,
  instance: EvolutionContactInstance,
  store: ContactStore,
  savedNameRow?: DatabaseContactNameRow
): EvolutionContact {
  const remoteJid = readString(record, "remoteJid") ?? ""
  const number = normalizePhone(remoteJid.split("@")[0])
  const id = makeContactId(instance.instanceName, number)
  const stored = store.contacts[id]
  const pushName = readString(record, "pushName") ?? undefined
  const savedName = normalizeContactDisplayName(savedNameRow?.name)
  const storedName = normalizeContactDisplayName(stored?.name)
  const fallbackName = normalizeContactDisplayName(pushName)
  const isSaved =
    Boolean(stored) ||
    Boolean(savedName && isUsefulContactName(savedName, number)) ||
    Boolean(readBoolean(record, "isSaved") && fallbackName)
  const name =
    storedName ||
    savedName ||
    (isSaved && fallbackName ? fallbackName : formatPhoneNumber(number))

  return {
    id,
    instanceName: instance.instanceName,
    instanceDisplayName: instance.displayName,
    remoteJid,
    number,
    formattedNumber: formatPhoneNumber(number),
    name,
    pushName,
    profilePicUrl: readString(record, "profilePicUrl") ?? undefined,
    labels: stored?.labels ?? [],
    blocked: stored?.blocked ?? false,
    reported: stored?.reported ?? false,
    source: stored?.source ?? "evolution",
    isSaved,
    updatedAt:
      stored?.updatedAt ?? savedNameRow?.updatedAt ?? readString(record, "updatedAt"),
  }
}

function createStoredContact(
  contact: StoredContact,
  instance: EvolutionContactInstance
): EvolutionContact {
  return {
    id: contact.id,
    instanceName: contact.instanceName,
    instanceDisplayName: instance.displayName,
    remoteJid: `${contact.number}@s.whatsapp.net`,
    number: contact.number,
    formattedNumber: formatPhoneNumber(contact.number),
    name: contact.name,
    labels: contact.labels,
    blocked: contact.blocked,
    reported: contact.reported,
    source: contact.source,
    isSaved: true,
    updatedAt: contact.updatedAt,
  }
}

function toStoredContact(contact: EvolutionContact): StoredContact {
  const now = new Date().toISOString()

  return {
    id: contact.id,
    instanceName: contact.instanceName,
    number: contact.number,
    name: contact.name,
    labels: contact.labels,
    blocked: contact.blocked,
    reported: contact.reported,
    source: contact.source === "evolution" ? "manual" : contact.source,
    createdAt: contact.updatedAt ?? now,
    updatedAt: now,
  }
}

async function readContactStore(): Promise<ContactStore> {
  try {
    const content = await readFile(STORE_PATH, "utf8")
    const parsed = JSON.parse(content) as Partial<ContactStore>

    return {
      contacts:
        parsed.contacts && typeof parsed.contacts === "object"
          ? parsed.contacts
          : {},
      labels: normalizeLabels(parsed.labels ?? DEFAULT_LABELS),
    }
  } catch {
    return {
      contacts: {},
      labels: DEFAULT_LABELS,
    }
  }
}

async function writeContactStore(store: ContactStore) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true })
  await writeFile(
    STORE_PATH,
    JSON.stringify(
      {
        contacts: store.contacts,
        labels: normalizeLabels(store.labels),
      },
      null,
      2
    )
  )
}

function requireInstance(
  snapshot: EvolutionContactsSnapshot,
  instanceName: string
) {
  const instance = snapshot.instances.find(
    (item) => item.instanceName === instanceName
  )

  if (!instance) {
    throw new EvolutionContactError("Selecione um WhatsApp conectado.")
  }

  return instance
}

function resolveImportInstance(
  instances: EvolutionContactInstance[],
  value?: string
) {
  const normalizedValue = normalizeName(value ?? "")

  if (!normalizedValue) {
    return null
  }

  return (
    instances.find(
      (instance) =>
        instance.instanceName === value ||
        normalizeName(instance.displayName) === normalizedValue
    ) ?? null
  )
}

function requireContact(snapshot: EvolutionContactsSnapshot, contactId: string) {
  const contact = snapshot.contacts.find((item) => item.id === contactId)

  if (!contact) {
    throw new EvolutionContactError("Contato nao encontrado.", 404)
  }

  return contact
}

function assertNoDuplicate(
  contacts: EvolutionContact[],
  next: {
    instanceName: string
    number: string
    name: string
    ignoreId?: string
  }
) {
  if (hasDuplicate(contacts, next)) {
    throw new EvolutionContactError(
      "Ja existe um contato salvo com o mesmo numero ou nome.",
      409
    )
  }
}

function hasDuplicate(
  contacts: EvolutionContact[],
  next: {
    instanceName: string
    number: string
    name: string
    ignoreId?: string
  }
) {
  const nextName = normalizeName(next.name)
  const nextNumber = normalizePhone(next.number)

  return contacts.some((contact) => {
    if (contact.id === next.ignoreId || contact.instanceName !== next.instanceName) {
      return false
    }

    return (
      normalizePhone(contact.number) === nextNumber ||
      Boolean(nextName && normalizeName(contact.name) === nextName)
    )
  })
}

function compareContacts(left: EvolutionContact, right: EvolutionContact) {
  const leftRank = getContactSortRank(left)
  const rightRank = getContactSortRank(right)

  return (
    leftRank - rightRank ||
    compareContactNames(left.name, right.name) ||
    left.instanceDisplayName.localeCompare(right.instanceDisplayName, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    }) ||
    left.formattedNumber.localeCompare(right.formattedNumber, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    })
  )
}

function getContactSortRank(contact: EvolutionContact) {
  return contact.isSaved && isUsefulContactName(contact.name, contact.number) ? 0 : 1
}

function compareContactNames(left: string, right: string) {
  return left.localeCompare(right, "pt-BR", {
    ignorePunctuation: true,
    numeric: true,
    sensitivity: "base",
  })
}

function makeContactId(instanceName: string, number: string) {
  return `${instanceName}:${number}`
}

function normalizeLabels(labels: string[]) {
  return [
    ...new Set(
      labels
        .map((label) => label.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
    ),
  ]
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "")
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeContactDisplayName(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? ""
}

function isUsefulContactName(value: string, number: string) {
  const normalized = normalizeContactDisplayName(value)

  if (!normalized) {
    return false
  }

  if (normalizePhone(normalized) === normalizePhone(number)) {
    return false
  }

  return /[\p{L}\p{N}]/u.test(normalized)
}

function formatPhoneNumber(value: string) {
  const digits = normalizePhone(value)

  if (digits.startsWith("55") && digits.length >= 12) {
    const country = digits.slice(0, 2)
    const area = digits.slice(2, 4)
    const body = digits.slice(4, -4)
    const suffix = digits.slice(-4)

    return `+${country} ${area} ${body}-${suffix}`
  }

  return digits ? `+${digits}` : "-"
}

function isConnectedState(state?: string) {
  return state === "open" || state === "connected"
}

function isPhoneContactJid(remoteJid: string) {
  return remoteJid.endsWith("@s.whatsapp.net")
}

async function runEvolutionJsonQuery<T>(query: string) {
  const postgresContainer =
    process.env.EVOLUTION_POSTGRES_CONTAINER || "evo_postgres"
  const postgresUser = process.env.EVOLUTION_POSTGRES_USER || "evolution"
  const postgresDatabase =
    process.env.EVOLUTION_POSTGRES_DATABASE || "evolution"
  const sql = `
SELECT COALESCE(jsonb_agg(to_jsonb(result)), '[]'::jsonb)::text
FROM (
${query}
) result;
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
    ],
    sql,
    20_000
  )
  const text = result.stdout.trim()

  return text ? (JSON.parse(text) as T[]) : []
}

function runCommand(
  command: string,
  args: string[],
  input?: string,
  timeoutMs = 10_000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams
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

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })
    child.on("error", (error: Error) => {
      if (settle()) {
        reject(error)
      }
    })
    child.on("close", (code: number | null) => {
      if (!settle()) {
        return
      }

      if (code === 0) {
        resolve({ stderr, stdout })
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

function quoteSqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function readString(record: unknown, key: string) {
  if (!isRecord(record)) {
    return undefined
  }

  const value = record[key]

  return typeof value === "string" ? value : undefined
}

function readBoolean(record: unknown, key: string) {
  if (!isRecord(record)) {
    return undefined
  }

  const value = record[key]

  return typeof value === "boolean" ? value : undefined
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null
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
    throw new EvolutionContactError(
      "Configure EVOLUTION_API_KEY no .env.local.",
      500
    )
  }

  return {
    baseUrl,
    apiKey,
  }
}
