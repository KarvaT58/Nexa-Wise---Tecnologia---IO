export type EvolutionContactSource = "evolution" | "manual" | "import"

export type EvolutionContactInstance = {
  instanceName: string
  displayName: string
  phoneNumber?: string
  status: string
}

export type EvolutionContact = {
  id: string
  instanceName: string
  instanceDisplayName: string
  remoteJid: string
  number: string
  formattedNumber: string
  name: string
  pushName?: string
  profilePicUrl?: string
  labels: string[]
  blocked: boolean
  reported: boolean
  source: EvolutionContactSource
  isSaved: boolean
  updatedAt?: string
}

export type EvolutionContactImportRow = {
  name: string
  number: string
  labels?: string[]
  instanceName?: string
}

export type EvolutionContactImportResult = {
  added: number
  discarded: number
  duplicates: number
  invalid: number
  errors: string[]
}

export type EvolutionContactsSnapshot = {
  instances: EvolutionContactInstance[]
  contacts: EvolutionContact[]
  labels: string[]
  totals: {
    contacts: number
    instances: number
    blocked: number
    reported: number
    labels: number
  }
  updatedAt: string
}

export const CONTACT_IMPORT_EXAMPLE = [
  {
    nome: "Maria Silva",
    numero: "554599999999",
    etiquetas: "Cliente|VIP",
    whatsapp: "Teste 1",
  },
  {
    nome: "Joao Souza",
    numero: "11988887777",
    etiquetas: "Lead",
    whatsapp: "",
  },
]
