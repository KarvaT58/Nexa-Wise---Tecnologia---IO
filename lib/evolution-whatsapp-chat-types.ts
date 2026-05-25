import { type EvolutionContact } from "@/lib/evolution-contacts-types"

export type WhatsAppConversationKind = "contact" | "group"

export type WhatsAppConversation = {
  id: string
  instanceName: string
  instanceDisplayName: string
  remoteJid: string
  kind: WhatsAppConversationKind
  name: string
  number: string
  formattedNumber: string
  profilePicUrl?: string
  unreadMessages: number
  lastMessageText: string
  lastMessageType: string
  lastMessageFromMe: boolean
  lastMessageStatus?: string | null
  lastMessageAt?: string | null
  updatedAt?: string | null
}

export type WhatsAppChatMessage = {
  id: string
  instanceName: string
  remoteJid: string
  fromMe: boolean
  senderName: string
  text: string
  type: string
  participant?: string | null
  quoted?: {
    fromMe?: boolean
    id?: string
    senderName?: string
    text: string
  } | null
  keyId?: string | null
  orderKey?: string | null
  reaction?: string | null
  status?: string | null
  timestamp?: string | null
  mediaUrl?: string | null
  mimetype?: string | null
  fileName?: string | null
  fileSize?: string | null
  audioSeconds?: number | null
  deletedTargetKeyId?: string | null
  editedAt?: string | null
  editTargetKeyId?: string | null
  forwardingScore?: number | null
  favoritedAt?: string | null
  isFavorite?: boolean
  isForwarded?: boolean
  isDeletedForEveryone?: boolean
  isEditProtocol?: boolean
  isEdited?: boolean
  isPinned?: boolean
  pinnedAt?: string | null
  pinnedExpiresAt?: string | null
}

export type WhatsAppChatSnapshot = {
  instances: Array<{
    instanceName: string
    displayName: string
    phoneNumber?: string
    status: string
  }>
  conversations: WhatsAppConversation[]
  contacts: EvolutionContact[]
  selected?: {
    instanceName: string
    remoteJid: string
    messages: WhatsAppChatMessage[]
    hasMore?: boolean
  } | null
  totals: {
    conversations: number
    contacts: number
    groups: number
    unread: number
    instances: number
  }
  updatedAt: string
}

export type WhatsAppGroupParticipant = {
  id: string
  number: string
  name: string
  isAdmin: boolean
  isSuperAdmin: boolean
  profilePicUrl?: string
}

export type WhatsAppGroup = {
  id: string
  instanceName: string
  instanceDisplayName: string
  subject: string
  description?: string | null
  pictureUrl?: string | null
  owner?: string | null
  size: number
  restrict: boolean
  announce: boolean
  creation?: string | null
  updatedAt?: string | null
  unreadMessages: number
  participants: WhatsAppGroupParticipant[]
}

export type WhatsAppGroupsSnapshot = {
  instances: WhatsAppChatSnapshot["instances"]
  contacts: EvolutionContact[]
  groups: WhatsAppGroup[]
  totals: {
    groups: number
    participants: number
    announcement: number
    restricted: number
    instances: number
  }
  updatedAt: string
}

export type WhatsAppMediaPayload = {
  media: string
  mimetype: string
  fileName: string
  fileSize?: string
  audioSeconds?: number
  mediatype: "image" | "video" | "document" | "audio"
}
