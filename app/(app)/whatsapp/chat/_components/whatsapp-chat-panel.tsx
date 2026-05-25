"use client"

import * as React from "react"
import {
  ArrowLeftIcon,
  BanIcon,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  CheckCheckIcon,
  FlagIcon,
  ForwardIcon,
  HeartIcon,
  ImageIcon,
  InfoIcon,
  Loader2Icon,
  LockIcon,
  Maximize2Icon,
  MessageCircleIcon,
  MicIcon,
  PauseIcon,
  PencilIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  ShieldIcon,
  SmileIcon,
  SmartphoneIcon,
  SquareIcon,
  StarIcon,
  TimerIcon,
  Trash2Icon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { type EvolutionContact } from "@/lib/evolution-contacts-types"
import {
  type WhatsAppChatMessage,
  type WhatsAppChatSnapshot,
  type WhatsAppConversation,
  type WhatsAppMediaPayload,
} from "@/lib/evolution-whatsapp-chat-types"

type ChatActionResponse = {
  snapshot: WhatsAppChatSnapshot
}

type ChatMessagesResponse = {
  selected: {
    hasMore?: boolean
    instanceName: string
    messages: WhatsAppChatMessage[]
    remoteJid: string
  } | null
}

type MessagePaginationState = {
  hasMore: boolean
  isLoading: boolean
}

type ComboboxOption = {
  label: string
  value: string
}

type StartConversationInput = {
  formattedNumber?: string
  instanceDisplayName?: string
  instanceName: string
  name?: string
  number?: string
  profilePicUrl?: string
  remoteJid: string
}

type ContactPanelView = "details" | "favorites" | "media"
type MediaPanelTab = "documents" | "links" | "media"
type PinDurationOption = "168" | "24" | "720"
type AudioRecorderState = "idle" | "preview" | "recording"
type UploadKind = "audio" | "document" | "media"

const ALL_VALUE = "all"
const POLLING_INTERVAL_MS = 2500
const SNAPSHOT_REFRESH_INTERVAL_MS = 3000
const DEFAULT_MESSAGES_PAGE_SIZE = 120
const OLDER_MESSAGES_PAGE_SIZE = 80
const TOP_SCROLL_THRESHOLD_PX = 96
const DEFAULT_FORWARD_TARGET_LIMIT = 5
const HIGHLY_FORWARDED_TARGET_LIMIT = 1
const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000
const EDIT_MESSAGE_WINDOW_MS = 15 * 60 * 1000
const PIN_DURATION_OPTIONS: Array<{
  description: string
  label: string
  value: PinDurationOption
}> = [
  {
    description: "Padrao do WhatsApp",
    label: "7 dias",
    value: "168",
  },
  {
    description: "Fixa por um dia",
    label: "24 horas",
    value: "24",
  },
  {
    description: "Tempo maximo",
    label: "30 dias",
    value: "720",
  },
]

export function WhatsAppChatPanel() {
  const [snapshot, setSnapshot] = React.useState<WhatsAppChatSnapshot | null>(null)
  const [selectedKey, setSelectedKey] = React.useState<string>("")
  const [query, setQuery] = React.useState("")
  const [instanceFilter, setInstanceFilter] = React.useState(ALL_VALUE)
  const [messagesByConversation, setMessagesByConversation] = React.useState<
    Record<string, WhatsAppChatMessage[]>
  >({})
  const [messagePaginationByConversation, setMessagePaginationByConversation] =
    React.useState<Record<string, MessagePaginationState>>({})
  const [optimisticMessages, setOptimisticMessages] = React.useState<
    WhatsAppChatMessage[]
  >([])
  const [chatSearch, setChatSearch] = React.useState("")
  const [chatSearchIndex, setChatSearchIndex] = React.useState(0)
  const [currentTime, setCurrentTime] = React.useState(() => Date.now())
  const [isChatSearchOpen, setIsChatSearchOpen] = React.useState(false)
  const [isInfoOpen, setIsInfoOpen] = React.useState(false)
  const [contactPanelView, setContactPanelView] =
    React.useState<ContactPanelView>("details")
  const [mediaPanelTab, setMediaPanelTab] =
    React.useState<MediaPanelTab>("media")
  const [contactNote, setContactNote] = React.useState("")
  const [isEditingContactNote, setIsEditingContactNote] = React.useState(false)
  const [isContactMuted, setIsContactMuted] = React.useState(false)
  const [isContactFavorite, setIsContactFavorite] = React.useState(false)
  const [isContactBlocked, setIsContactBlocked] = React.useState(false)
  const [isStartDialogOpen, setIsStartDialogOpen] = React.useState(false)
  const [startInstanceName, setStartInstanceName] = React.useState("")
  const [startQuery, setStartQuery] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [media, setMedia] = React.useState<WhatsAppMediaPayload | null>(null)
  const [mediaViewerMessageId, setMediaViewerMessageId] = React.useState("")
  const [audioRecorderState, setAudioRecorderState] =
    React.useState<AudioRecorderState>("idle")
  const [recordedAudio, setRecordedAudio] =
    React.useState<WhatsAppMediaPayload | null>(null)
  const [recordingPreviewUrl, setRecordingPreviewUrl] = React.useState("")
  const [recordingSeconds, setRecordingSeconds] = React.useState(0)
  const [isRecordingFinalizing, setIsRecordingFinalizing] =
    React.useState(false)
  const [editingMessage, setEditingMessage] =
    React.useState<WhatsAppChatMessage | null>(null)
  const [replyTo, setReplyTo] = React.useState<WhatsAppChatMessage | null>(null)
  const [pinMessage, setPinMessage] = React.useState<WhatsAppChatMessage | null>(
    null
  )
  const [pinDuration, setPinDuration] =
    React.useState<PinDurationOption>("168")
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false)
  const [isDeleteSelectionMode, setIsDeleteSelectionMode] =
    React.useState(false)
  const [selectedDeleteMessageKeys, setSelectedDeleteMessageKeys] =
    React.useState<string[]>([])
  const [isForwardDialogOpen, setIsForwardDialogOpen] = React.useState(false)
  const [isForwardSelectionMode, setIsForwardSelectionMode] =
    React.useState(false)
  const [selectedForwardMessageKeys, setSelectedForwardMessageKeys] =
    React.useState<string[]>([])
  const [forwardQuery, setForwardQuery] = React.useState("")
  const [selectedForwardKeys, setSelectedForwardKeys] = React.useState<string[]>(
    []
  )
  const [isLoading, setIsLoading] = React.useState(true)
  const [loadingConversationKey, setLoadingConversationKey] = React.useState("")
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [isSending, setIsSending] = React.useState(false)
  const [isForwarding, setIsForwarding] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [isPinning, setIsPinning] = React.useState(false)
  const [highlightedMessageId, setHighlightedMessageId] = React.useState("")
  const messageInputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const audioUploadInputRef = React.useRef<HTMLInputElement | null>(null)
  const documentUploadInputRef = React.useRef<HTMLInputElement | null>(null)
  const mediaUploadInputRef = React.useRef<HTMLInputElement | null>(null)
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const messagesScrollRef = React.useRef<HTMLDivElement | null>(null)
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const recordingCanceledRef = React.useRef(false)
  const recordingChunksRef = React.useRef<Blob[]>([])
  const recordingStartedAtRef = React.useRef(0)
  const recordingStreamRef = React.useRef<MediaStream | null>(null)
  const recordingTimerRef = React.useRef<number | null>(null)
  const latestInboundByConversationRef = React.useRef<Record<string, string>>({})
  const hasHydratedNotificationsRef = React.useRef(false)
  const realtimeSyncTimerRef = React.useRef<number | null>(null)
  const snapshotRequestSeqRef = React.useRef(0)
  const seenConversationMarkersRef = React.useRef<Record<string, string>>({})
  const sendQueueRef = React.useRef<Promise<void>>(Promise.resolve())
  const optimisticMessageSequenceRef = React.useRef(0)
  const optimisticTimestampRef = React.useRef(0)
  const isLoadingOlderMessagesRef = React.useRef(false)
  const lastAutoScrollKeyRef = React.useRef("")
  const snapshotRef = React.useRef<WhatsAppChatSnapshot | null>(null)
  const conversationListCacheRef = React.useRef<
    Record<string, WhatsAppConversation>
  >({})
  const selectedConversationRef =
    React.useRef<WhatsAppConversation | null>(null)
  const selectedKeyRef = React.useRef("")
  const browserNotificationsRef = React.useRef<Record<string, Notification[]>>(
    {}
  )

  const selectedConversation = React.useMemo(() => {
    if (!snapshot) {
      return null
    }

    const contactConversations = snapshot.conversations.filter(
      (conversation) => conversation.kind === "contact"
    )

    const keyedConversation = contactConversations.find(
      (conversation) => getConversationKey(conversation) === selectedKey
    ) ?? conversationListCacheRef.current[selectedKey]

    if (selectedKey) {
      return keyedConversation ?? null
    }

    return keyedConversation ?? contactConversations[0] ?? null
  }, [selectedKey, snapshot])

  const stableContactConversations = React.useMemo(() => {
    if (!snapshot) {
      return []
    }

    const activeInstanceNames = new Set(
      snapshot.instances.map((instance) => instance.instanceName)
    )
    const conversationsByKey = new Map<string, WhatsAppConversation>()

    for (const conversation of Object.values(conversationListCacheRef.current)) {
      if (
        conversation.kind === "contact" &&
        activeInstanceNames.has(conversation.instanceName)
      ) {
        conversationsByKey.set(getConversationKey(conversation), conversation)
      }
    }

    for (const conversation of snapshot.conversations) {
      if (conversation.kind === "contact") {
        conversationsByKey.set(getConversationKey(conversation), conversation)
      }
    }

    const selected = selectedConversation ?? selectedConversationRef.current

    if (
      selected?.kind === "contact" &&
      activeInstanceNames.has(selected.instanceName)
    ) {
      conversationsByKey.set(getConversationKey(selected), selected)
    }

    return sortConversationsByActivity([...conversationsByKey.values()])
  }, [selectedConversation, snapshot])

  const selectedMessagesFromSnapshot = React.useMemo(() => {
    if (!selectedConversation) {
      return []
    }

    const cachedMessages =
      messagesByConversation[getConversationKey(selectedConversation)]

    if (cachedMessages) {
      return cachedMessages
    }

    if (!snapshot?.selected) {
      return []
    }

    if (
      snapshot.selected.instanceName !== selectedConversation.instanceName ||
      snapshot.selected.remoteJid !== selectedConversation.remoteJid
    ) {
      return []
    }

    return snapshot.selected.messages
  }, [messagesByConversation, selectedConversation, snapshot])

  const selectedMessages = React.useMemo(() => {
    if (!selectedConversation) {
      return selectedMessagesFromSnapshot
    }

    return mergeOptimisticMessages(
      selectedMessagesFromSnapshot,
      optimisticMessages.filter(
        (chatMessage) =>
          chatMessage.instanceName === selectedConversation.instanceName &&
          chatMessage.remoteJid === selectedConversation.remoteJid
      )
    )
  }, [optimisticMessages, selectedConversation, selectedMessagesFromSnapshot])

  const selectedInstanceName = selectedConversation?.instanceName ?? ""
  const selectedRemoteJid = selectedConversation?.remoteJid ?? ""
  const isSelectedConversationLoading =
    Boolean(selectedConversation) &&
    loadingConversationKey === getConversationKey(selectedConversation)
  const selectedPaginationState = selectedKey
    ? messagePaginationByConversation[selectedKey]
    : undefined
  const isLoadingOlderMessages = Boolean(selectedPaginationState?.isLoading)

  React.useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  React.useEffect(() => {
    conversationListCacheRef.current = Object.fromEntries(
      stableContactConversations.map((conversation) => [
        getConversationKey(conversation),
        conversation,
      ])
    )
  }, [stableContactConversations])

  React.useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  React.useEffect(() => {
    selectedKeyRef.current = selectedKey
  }, [selectedKey])

  const notifyIncomingMessages = React.useCallback(
    (next: WhatsAppChatSnapshot) => {
      const latestInboundByConversation: Record<string, string> = {}
      const incomingConversations: WhatsAppConversation[] = []

      for (const conversation of next.conversations) {
        if (conversation.kind !== "contact" || conversation.unreadMessages <= 0) {
          continue
        }

        const marker =
          conversation.lastMessageAt ||
          conversation.updatedAt ||
          conversation.lastMessageText

        if (!marker) {
          continue
        }

        const key = getConversationKey(conversation)
        latestInboundByConversation[key] = marker

        if (!hasHydratedNotificationsRef.current) {
          continue
        }

        if (
          key === selectedKeyRef.current &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          continue
        }

        const previousMarker = latestInboundByConversationRef.current[key]

        if (
          conversation.unreadMessages > 0 &&
          ((previousMarker && previousMarker !== marker) ||
          (!previousMarker && conversation.unreadMessages > 0)
          )
        ) {
          incomingConversations.push(conversation)
        }
      }

      latestInboundByConversationRef.current = latestInboundByConversation

      if (!hasHydratedNotificationsRef.current) {
        hasHydratedNotificationsRef.current = true
        return
      }

      for (const conversation of incomingConversations.slice(0, 3)) {
        const preview =
          conversation.lastMessageFromMe && conversation.unreadMessages > 0
            ? "Nova mensagem recebida"
            : conversation.lastMessageText || conversation.formattedNumber

        toast.message(`Nova mensagem de ${conversation.name}`, {
          description: preview,
        })
        playWhatsAppNotificationSound()
        const notification = showBrowserNotification(
          `Nova mensagem de ${conversation.name}`,
          preview
        )
        const key = getConversationKey(conversation)

        if (notification) {
          browserNotificationsRef.current[key] = [
            ...(browserNotificationsRef.current[key] ?? []),
            notification,
          ]
          notification.onclick = () => {
            window.focus()
            closeConversationNotifications(key)
            selectedConversationRef.current = conversation
            selectedKeyRef.current = key
            setSelectedKey(key)
            setLoadingConversationKey(key)
            seenConversationMarkersRef.current[key] =
              conversation.lastMessageAt ||
              conversation.updatedAt ||
              conversation.lastMessageText ||
              key
            setSnapshot((current) =>
              current ? markSnapshotConversationRead(current, key) : current
            )
            void fetchChatMessages({
              instanceName: conversation.instanceName,
              remoteJid: conversation.remoteJid,
            })
              .then((result) => {
                const selected = result.selected

                if (!selected) {
                  return
                }

                setMessagesByConversation((current) => ({
                  ...current,
                  [key]: mergeFreshMessagesWithCached(
                    current[key] ?? [],
                    selected.messages
                  ),
                }))
                setMessagePaginationByConversation((current) => ({
                  ...current,
                  [key]: {
                    hasMore:
                      current[key]?.hasMore ??
                      (Boolean(selected.hasMore) ||
                        selected.messages.length >= DEFAULT_MESSAGES_PAGE_SIZE),
                    isLoading: false,
                  },
                }))
                setSnapshot((current) =>
                  current
                    ? {
                        ...markSnapshotConversationRead(current, key),
                        selected,
                      }
                    : current
                )
              })
              .catch(() => undefined)
              .finally(() => {
                setLoadingConversationKey((current) =>
                  current === key ? "" : current
                )
              })
            void postChatAction({
              action: "mark-read",
              instanceName: conversation.instanceName,
              remoteJid: conversation.remoteJid,
            }).catch(() => undefined)
          }
          notification.onclose = () => {
            browserNotificationsRef.current[key] =
              browserNotificationsRef.current[key]?.filter(
                (item) => item !== notification
              ) ?? []
          }
        }
      }
    },
    []
  )

  const fetchSnapshot = React.useCallback(
    async (options: {
      fallbackConversation?: WhatsAppConversation
      instanceName?: string
      remoteJid?: string
      silent?: boolean
    } = {}) => {
      if (!options.silent) {
        setIsSyncing(true)
      }

      const requestSeq = ++snapshotRequestSeqRef.current
      const selectionAtRequest = selectedKeyRef.current

      try {
        const next = await fetchChatSnapshot({
          instanceName: options.instanceName,
          remoteJid: options.remoteJid,
        })

        const currentSelected = selectedConversationRef.current
        const requestedInstanceName =
          options.instanceName ?? currentSelected?.instanceName
        const requestedRemoteJid =
          options.remoteJid ?? currentSelected?.remoteJid
        const hasRequestedConversation =
          requestedInstanceName && requestedRemoteJid
            ? next.conversations.some(
                (conversation) =>
                  conversation.instanceName === requestedInstanceName &&
                  conversation.remoteJid === requestedRemoteJid
              )
            : true
        const normalizedNext =
          options.fallbackConversation && !hasRequestedConversation
            ? {
                ...next,
                conversations: [
                  options.fallbackConversation,
                  ...next.conversations,
                ],
              }
            : next

        const stableNext = snapshotRef.current
          ? mergeSnapshotConversationPreviews(snapshotRef.current, normalizedNext)
          : normalizedNext

        snapshotRef.current = stableNext
        setSnapshot(stableNext)
        const selectedMessagesPayload = stableNext.selected

        if (selectedMessagesPayload) {
          const payloadKey = makeConversationKey(
            selectedMessagesPayload.instanceName,
            selectedMessagesPayload.remoteJid
          )

          setMessagesByConversation((current) => ({
            ...current,
            [payloadKey]: mergeFreshMessagesWithCached(
              current[payloadKey] ?? [],
              selectedMessagesPayload.messages
            ),
          }))
          setMessagePaginationByConversation((current) => ({
            ...current,
            [payloadKey]: {
              hasMore:
                current[payloadKey]?.hasMore ??
                (Boolean(selectedMessagesPayload.hasMore) ||
                  selectedMessagesPayload.messages.length >=
                    DEFAULT_MESSAGES_PAGE_SIZE),
              isLoading: false,
            },
          }))
          reconcileOptimisticMessagesWithServer(
            selectedMessagesPayload.instanceName,
            selectedMessagesPayload.remoteJid,
            selectedMessagesPayload.messages
          )
        }
        notifyIncomingMessages(stableNext)
        setStartInstanceName((current) =>
          current || stableNext.instances[0]?.instanceName || ""
        )

        const requestedKey =
          requestedInstanceName && requestedRemoteJid
            ? makeConversationKey(requestedInstanceName, requestedRemoteJid)
            : ""
        const currentSelectedKey = selectedKeyRef.current
        const canMoveSelection =
          !currentSelectedKey ||
          currentSelectedKey === requestedKey ||
          (requestSeq === snapshotRequestSeqRef.current &&
            currentSelectedKey === selectionAtRequest)
        const nextSelected =
          stableNext.conversations.find(
            (conversation) =>
              conversation.kind === "contact" &&
              conversation.instanceName ===
                (options.instanceName ?? currentSelected?.instanceName) &&
              conversation.remoteJid ===
                (options.remoteJid ?? currentSelected?.remoteJid)
          ) ?? null

        if (nextSelected && canMoveSelection) {
          setSelectedKey(getConversationKey(nextSelected))
        } else if (!options.remoteJid && !currentSelectedKey) {
          const firstContact = stableNext.conversations.find(
            (conversation) => conversation.kind === "contact"
          )

          if (firstContact) {
            setSelectedKey(getConversationKey(firstContact))
          }
        }

        return stableNext
      } catch (error) {
        if (!options.silent) {
          toast.error(getRequestErrorMessage(error))
        }
        return null
      } finally {
        setIsLoading(false)
        setIsSyncing(false)
      }
    },
    [notifyIncomingMessages]
  )

  const fetchMessages = React.useCallback(
    async ({
      instanceName,
      remoteJid,
      silent = false,
    }: {
      instanceName: string
      remoteJid: string
      silent?: boolean
    }) => {
      const key = makeConversationKey(instanceName, remoteJid)

      try {
        const result = await fetchChatMessages({
          instanceName,
          remoteJid,
        })
        const selected = result.selected

        if (!selected) {
          return []
        }

        setMessagesByConversation((current) => ({
          ...current,
          [key]: mergeFreshMessagesWithCached(
            current[key] ?? [],
            selected.messages
          ),
        }))
        setMessagePaginationByConversation((current) => ({
          ...current,
          [key]: {
            hasMore:
              current[key]?.hasMore ??
              (Boolean(selected.hasMore) ||
                selected.messages.length >= DEFAULT_MESSAGES_PAGE_SIZE),
            isLoading: false,
          },
        }))
        reconcileOptimisticMessagesWithServer(
          selected.instanceName,
          selected.remoteJid,
          selected.messages
        )
        setSnapshot((current) =>
          current && selectedKeyRef.current === key
            ? {
                ...updateSnapshotConversationFromMessages(
                  current,
                  key,
                  selected.messages
                ),
                selected,
              }
            : current
              ? updateSnapshotConversationFromMessages(
                  current,
                  key,
                  selected.messages
                )
              : current
        )

        return selected.messages
      } catch (error) {
        if (!silent) {
          toast.error(getRequestErrorMessage(error))
        }

        return null
      } finally {
        setLoadingConversationKey((current) => (current === key ? "" : current))
      }
    },
    []
  )

  const loadOlderMessages = React.useCallback(async () => {
    const conversation = selectedConversationRef.current

    if (!conversation) {
      return
    }

    const key = getConversationKey(conversation)
    const currentPagination = messagePaginationByConversation[key]

    if (
      isLoadingOlderMessagesRef.current ||
      currentPagination?.isLoading ||
      currentPagination?.hasMore === false
    ) {
      return
    }

    const currentMessages =
      messagesByConversation[key] ??
      (snapshot?.selected?.instanceName === conversation.instanceName &&
      snapshot.selected.remoteJid === conversation.remoteJid
        ? snapshot.selected.messages
        : [])
    const oldestMessage = getOldestServerMessage(currentMessages)

    if (!oldestMessage?.timestamp) {
      setMessagePaginationByConversation((current) => ({
        ...current,
        [key]: {
          hasMore: false,
          isLoading: false,
        },
      }))
      return
    }

    const scrollContainer = messagesScrollRef.current
    const previousScrollHeight = scrollContainer?.scrollHeight ?? 0
    const previousScrollTop = scrollContainer?.scrollTop ?? 0

    isLoadingOlderMessagesRef.current = true
    setMessagePaginationByConversation((current) => ({
      ...current,
      [key]: {
        hasMore: current[key]?.hasMore ?? true,
        isLoading: true,
      },
    }))

    try {
      const result = await fetchChatMessages({
        beforeId: oldestMessage.id,
        beforeOrderKey: oldestMessage.orderKey ?? undefined,
        beforeTimestamp: oldestMessage.timestamp,
        instanceName: conversation.instanceName,
        limit: OLDER_MESSAGES_PAGE_SIZE,
        remoteJid: conversation.remoteJid,
      })
      const selected = result.selected

      if (!selected || selectedKeyRef.current !== key) {
        setMessagePaginationByConversation((current) => ({
          ...current,
          [key]: {
            hasMore: current[key]?.hasMore ?? true,
            isLoading: false,
          },
        }))
        return
      }

      setMessagesByConversation((current) => ({
        ...current,
        [key]: mergeMessagePages(current[key] ?? currentMessages, selected.messages),
      }))
      setMessagePaginationByConversation((current) => ({
        ...current,
        [key]: {
          hasMore:
            Boolean(selected.hasMore) ||
            selected.messages.length >= OLDER_MESSAGES_PAGE_SIZE,
          isLoading: false,
        },
      }))

      window.requestAnimationFrame(() => {
        const nextScrollContainer = messagesScrollRef.current

        if (nextScrollContainer && selectedKeyRef.current === key) {
          nextScrollContainer.scrollTop =
            nextScrollContainer.scrollHeight -
            previousScrollHeight +
            previousScrollTop
        }
      })
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
      setMessagePaginationByConversation((current) => ({
        ...current,
        [key]: {
          hasMore: current[key]?.hasMore ?? true,
          isLoading: false,
        },
      }))
    } finally {
      window.setTimeout(() => {
        isLoadingOlderMessagesRef.current = false
      }, 0)
    }
  }, [messagePaginationByConversation, messagesByConversation, snapshot])

  const handleMessagesScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (event.currentTarget.scrollTop <= TOP_SCROLL_THRESHOLD_PX) {
        void loadOlderMessages()
      }
    },
    [loadOlderMessages]
  )

  const markConversationAsSeen = React.useCallback(
    (conversation: WhatsAppConversation) => {
      const key = getConversationKey(conversation)
      const marker =
        conversation.lastMessageAt ||
        conversation.updatedAt ||
        conversation.lastMessageText ||
        key

      seenConversationMarkersRef.current[key] = marker
      closeConversationNotifications(key)
      setSnapshot((current) =>
        current ? markSnapshotConversationRead(current, key) : current
      )

      void postChatAction({
        action: "mark-read",
        instanceName: conversation.instanceName,
        remoteJid: conversation.remoteJid,
      }).catch(() => undefined)
    },
    []
  )

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      const instanceName = params.get("instance")
      const remoteJid = params.get("jid")

      void fetchSnapshot({
        instanceName: instanceName ?? undefined,
        remoteJid: remoteJid ?? undefined,
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [fetchSnapshot])

  React.useEffect(() => {
    if (!selectedConversation) {
      return
    }

    if (document.visibilityState !== "visible") {
      return
    }

    const key = getConversationKey(selectedConversation)
    const marker =
      selectedConversation.lastMessageAt ||
      selectedConversation.updatedAt ||
      selectedConversation.lastMessageText ||
      key

    if (seenConversationMarkersRef.current[key] === marker) {
      return
    }

    seenConversationMarkersRef.current[key] = marker
    markConversationAsSeen(selectedConversation)
  }, [
    markConversationAsSeen,
    selectedConversation,
  ])

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      const selected = selectedConversationRef.current
      const key = getConversationKey(selected)
      const marker =
        selected?.lastMessageAt ||
        selected?.updatedAt ||
        selected?.lastMessageText ||
        key

      if (
        document.visibilityState === "visible" &&
        selected &&
        seenConversationMarkersRef.current[key] !== marker
      ) {
        seenConversationMarkersRef.current[key] = marker
        markConversationAsSeen(selected)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [markConversationAsSeen])

  React.useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return
    }

    if (Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined" || !("EventSource" in window)) {
      return
    }

    const eventSource = new EventSource("/api/evolution-whatsapp/realtime")
    const scheduleRefresh = () => {
      if (realtimeSyncTimerRef.current) {
        window.clearTimeout(realtimeSyncTimerRef.current)
      }

      realtimeSyncTimerRef.current = window.setTimeout(() => {
        const selected = selectedConversationRef.current

        void fetchSnapshot({
          instanceName: selected?.instanceName,
          remoteJid: selected?.remoteJid,
          silent: true,
        })
      }, 250)
    }

    eventSource.addEventListener("sync", scheduleRefresh)
    eventSource.addEventListener("message", scheduleRefresh)

    return () => {
      eventSource.removeEventListener("sync", scheduleRefresh)
      eventSource.removeEventListener("message", scheduleRefresh)
      eventSource.close()

      if (realtimeSyncTimerRef.current) {
        window.clearTimeout(realtimeSyncTimerRef.current)
        realtimeSyncTimerRef.current = null
      }
    }
  }, [fetchSnapshot])

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 15000)

    return () => window.clearInterval(interval)
  }, [])

  React.useEffect(
    () => () => {
      clearRecordingTimer()
      stopRecordingStream()

      if (recordingPreviewUrl) {
        URL.revokeObjectURL(recordingPreviewUrl)
      }
    },
    [recordingPreviewUrl]
  )

  React.useEffect(() => {
    if (!selectedInstanceName || !selectedRemoteJid) {
      return
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return
      }

      void fetchMessages({
        instanceName: selectedInstanceName,
        remoteJid: selectedRemoteJid,
        silent: true,
      })
    }, POLLING_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [fetchMessages, selectedInstanceName, selectedRemoteJid])

  React.useEffect(() => {
    if (!selectedInstanceName || !selectedRemoteJid) {
      return
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return
      }

      void fetchSnapshot({
        instanceName: selectedInstanceName,
        remoteJid: selectedRemoteJid,
        silent: true,
      })
    }, SNAPSHOT_REFRESH_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [fetchSnapshot, selectedInstanceName, selectedRemoteJid])

  React.useEffect(() => {
    if (!selectedKey || isLoadingOlderMessagesRef.current) {
      return
    }

    const scrollContainer = messagesScrollRef.current
    const isConversationChange = lastAutoScrollKeyRef.current !== selectedKey
    const distanceFromBottom = scrollContainer
      ? scrollContainer.scrollHeight -
        scrollContainer.scrollTop -
        scrollContainer.clientHeight
      : 0
    const isNearBottom = distanceFromBottom < 180

    if (isConversationChange || isNearBottom) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isConversationChange ? "auto" : "smooth",
      })
    }

    lastAutoScrollKeyRef.current = selectedKey
  }, [selectedMessages.length, selectedKey])

  React.useEffect(() => {
    if (!replyTo) {
      return
    }

    const timer = window.setTimeout(() => {
      messageInputRef.current?.focus()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [replyTo])

  const filteredConversations = React.useMemo(() => {
    if (!snapshot) {
      return []
    }

    const normalizedQuery = normalizeText(query)
    const numberQuery = query.replace(/\D/g, "")

    return stableContactConversations.filter((conversation) => {
      const matchesQuery =
        !normalizedQuery ||
        normalizeText(conversation.name).includes(normalizedQuery) ||
        normalizeText(conversation.lastMessageText).includes(normalizedQuery) ||
        (numberQuery
          ? conversation.number.replace(/\D/g, "").includes(numberQuery)
          : false)
      const matchesInstance =
        instanceFilter === ALL_VALUE ||
        conversation.instanceName === instanceFilter

      return matchesQuery && matchesInstance
    })
  }, [instanceFilter, query, snapshot, stableContactConversations])

  const chatSearchResults = React.useMemo(() => {
    const normalizedQuery = normalizeText(chatSearch)

    if (!normalizedQuery) {
      return []
    }

    return selectedMessages.filter((chatMessage) =>
      normalizeText(chatMessage.text).includes(normalizedQuery)
    )
  }, [chatSearch, selectedMessages])

  const visibleMessages = selectedMessages
  const selectedDeleteMessages = React.useMemo(() => {
    const selectedKeys = new Set(selectedDeleteMessageKeys)

    return visibleMessages.filter((chatMessage) =>
      selectedKeys.has(getMessageSelectionKey(chatMessage))
    )
  }, [selectedDeleteMessageKeys, visibleMessages])
  const selectedDeleteCount = selectedDeleteMessages.length
  const canDeleteSelectionForEveryone =
    selectedDeleteMessages.length > 0 &&
    selectedDeleteMessages.every(
      (chatMessage) =>
        chatMessage.fromMe && canDeleteMessageForEveryone(chatMessage)
    )
  const selectedForwardMessages = React.useMemo(() => {
    const selectedKeys = new Set(selectedForwardMessageKeys)

    return visibleMessages.filter((chatMessage) =>
      selectedKeys.has(getMessageSelectionKey(chatMessage))
    )
  }, [selectedForwardMessageKeys, visibleMessages])
  const selectedForwardMessageCount = selectedForwardMessages.length

  React.useEffect(() => {
    if (!chatSearch || !chatSearchResults.length) {
      return
    }

    const target = chatSearchResults[Math.min(chatSearchIndex, chatSearchResults.length - 1)]

    if (target) {
      scrollToMessage(target)
    }
  }, [chatSearch, chatSearchIndex, chatSearchResults])

  const contactMediaItems = React.useMemo(
    () =>
      selectedMessages.filter(
        (chatMessage) =>
          chatMessage.mediaUrl &&
          (chatMessage.type.includes("image") ||
            chatMessage.type.includes("video"))
      ),
    [selectedMessages]
  )

  const visualMediaItems = React.useMemo(
    () => selectedMessages.filter((chatMessage) => isVisualMediaMessage(chatMessage)),
    [selectedMessages]
  )

  const mediaViewerIndex = React.useMemo(
    () =>
      visualMediaItems.findIndex(
        (chatMessage) => getMessageMediaKey(chatMessage) === mediaViewerMessageId
      ),
    [mediaViewerMessageId, visualMediaItems]
  )

  const mediaViewerMessage =
    mediaViewerIndex >= 0 ? visualMediaItems[mediaViewerIndex] : null

  const contactDocumentItems = React.useMemo(
    () =>
      selectedMessages.filter(
        (chatMessage) =>
          chatMessage.mediaUrl && chatMessage.type.includes("document")
      ),
    [selectedMessages]
  )

  const contactLinkItems = React.useMemo(
    () =>
      selectedMessages.filter((chatMessage) =>
        /https?:\/\/\S+/i.test(chatMessage.text)
      ),
    [selectedMessages]
  )

  const favoriteMessages = React.useMemo(
    () => selectedMessages.filter((chatMessage) => chatMessage.isFavorite),
    [selectedMessages]
  )

  const pinnedMessages = React.useMemo(
    () =>
      selectedMessages
        .filter(
          (chatMessage) =>
            chatMessage.isPinned && !isDateExpired(chatMessage.pinnedExpiresAt)
        )
        .sort(
          (left, right) =>
            new Date(right.pinnedAt ?? right.timestamp ?? 0).getTime() -
            new Date(left.pinnedAt ?? left.timestamp ?? 0).getTime()
        )
        .slice(0, 3),
    [selectedMessages]
  )

  const forwardTargets = React.useMemo(() => {
    if (!snapshot) {
      return []
    }

    const normalizedQuery = normalizeText(forwardQuery)
    const numberQuery = forwardQuery.replace(/\D/g, "")

    return snapshot.conversations
      .filter((conversation) => {
        const matchesQuery =
          !normalizedQuery ||
          normalizeText(conversation.name).includes(normalizedQuery) ||
          normalizeText(conversation.lastMessageText).includes(normalizedQuery) ||
          (numberQuery
            ? conversation.number.replace(/\D/g, "").includes(numberQuery)
            : false)
        return matchesQuery
      })
      .slice(0, 120)
  }, [forwardQuery, snapshot])

  const selectedForwardTargets = React.useMemo(() => {
    if (!snapshot || !selectedForwardKeys.length) {
      return []
    }

    const selectedKeys = new Set(selectedForwardKeys)

    return snapshot.conversations.filter((conversation) =>
      selectedKeys.has(getConversationKey(conversation))
    )
  }, [selectedForwardKeys, snapshot])

  const startContacts = React.useMemo(() => {
    if (!snapshot || !startInstanceName) {
      return []
    }

    const normalizedQuery = normalizeText(startQuery)
    const numberQuery = startQuery.replace(/\D/g, "")

    return snapshot.contacts
      .filter((contact) => {
        if (contact.instanceName !== startInstanceName) {
          return false
        }

        if (!normalizedQuery && !numberQuery) {
          return true
        }

        return (
          normalizeText(contact.name).includes(normalizedQuery) ||
          normalizeText(contact.pushName ?? "").includes(normalizedQuery) ||
          contact.number.includes(numberQuery)
        )
      })
      .slice(0, 80)
  }, [snapshot, startInstanceName, startQuery])

  const manualStartOption = React.useMemo(() => {
    const remoteJid = getRemoteJidFromInput(startQuery)

    if (!startInstanceName || !remoteJid) {
      return null
    }

    const number = getRemoteJidNumber(remoteJid)
    const instanceDisplayName =
      snapshot?.instances.find(
        (instance) => instance.instanceName === startInstanceName
      )?.displayName ?? startInstanceName
    const formattedNumber = formatPhoneNumber(number)

    return {
      formattedNumber,
      instanceDisplayName,
      instanceName: startInstanceName,
      name: formattedNumber,
      number,
      remoteJid,
    } satisfies StartConversationInput
  }, [snapshot?.instances, startInstanceName, startQuery])

  const instanceOptions = React.useMemo(
    () => [
      { label: "Todos os WhatsApps", value: ALL_VALUE },
      ...(snapshot?.instances.map((instance) => ({
        label: instance.displayName,
        value: instance.instanceName,
      })) ?? []),
    ],
    [snapshot?.instances]
  )

  const startInstanceOptions = React.useMemo(
    () =>
      snapshot?.instances.map((instance) => ({
        label: instance.displayName,
        value: instance.instanceName,
      })) ?? [],
    [snapshot?.instances]
  )

  function closeConversationNotifications(key: string) {
    const notifications = browserNotificationsRef.current[key] ?? []

    for (const notification of notifications) {
      notification.close()
    }

    delete browserNotificationsRef.current[key]
  }

  function handleSelectConversation(conversation: WhatsAppConversation) {
    const key = getConversationKey(conversation)
    const hasCachedMessages = Boolean(messagesByConversation[key])

    cancelDeleteSelection()
    cancelForwardSelection()
    selectedConversationRef.current = conversation
    selectedKeyRef.current = key
    setSelectedKey(key)
    setLoadingConversationKey(hasCachedMessages ? "" : key)
    void fetchMessages({
      instanceName: conversation.instanceName,
      remoteJid: conversation.remoteJid,
      silent: hasCachedMessages,
    })
    markConversationAsSeen(conversation)
  }

  async function handleChangeInstanceFilter(value: string) {
    setInstanceFilter(value)

    const nextConversation = snapshot?.conversations.find(
      (conversation) =>
        conversation.kind === "contact" &&
        (value === ALL_VALUE || conversation.instanceName === value)
    )

    if (nextConversation) {
      handleSelectConversation(nextConversation)
    }
  }

  function openStartDialog() {
    const preferredInstance =
      selectedConversation?.instanceName ||
      (instanceFilter !== ALL_VALUE ? instanceFilter : "") ||
      snapshot?.instances[0]?.instanceName ||
      ""

    setStartInstanceName(preferredInstance)
    setStartQuery("")
    setIsStartDialogOpen(true)
  }

  async function startConversation(input: StartConversationInput) {
    if (!snapshot) {
      return
    }

    const instance = snapshot.instances.find(
      (item) => item.instanceName === input.instanceName
    )
    const number = input.number || getRemoteJidNumber(input.remoteJid)
    const fallbackConversation: WhatsAppConversation =
      snapshot.conversations.find(
        (conversation) =>
          conversation.instanceName === input.instanceName &&
          conversation.remoteJid === input.remoteJid
      ) ?? {
        formattedNumber: input.formattedNumber || formatPhoneNumber(number),
        id: `${input.instanceName}-${input.remoteJid}`,
        instanceDisplayName:
          input.instanceDisplayName || instance?.displayName || input.instanceName,
        instanceName: input.instanceName,
        kind: "contact",
        lastMessageFromMe: false,
        lastMessageText: "",
        lastMessageType: "conversation",
        name: input.name || input.formattedNumber || formatPhoneNumber(number),
        number,
        profilePicUrl: input.profilePicUrl,
        remoteJid: input.remoteJid,
        unreadMessages: 0,
        updatedAt: new Date().toISOString(),
      }

    setSnapshot((current) =>
      current &&
      !current.conversations.some(
        (conversation) =>
          conversation.instanceName === fallbackConversation.instanceName &&
          conversation.remoteJid === fallbackConversation.remoteJid
      )
        ? {
            ...current,
            conversations: [fallbackConversation, ...current.conversations],
          }
        : current
    )
    cancelDeleteSelection()
    cancelForwardSelection()
    setSelectedKey(getConversationKey(fallbackConversation))
    setInstanceFilter(input.instanceName)
    setIsStartDialogOpen(false)
    await fetchSnapshot({
      fallbackConversation,
      instanceName: input.instanceName,
      remoteJid: input.remoteJid,
      silent: true,
    })
  }

  async function handleStartConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!manualStartOption) {
      toast.warning("Informe o WhatsApp e um numero valido.")
      return
    }

    await startConversation(manualStartOption)
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedConversation) {
      toast.warning("Selecione uma conversa.")
      return
    }

    if (editingMessage) {
      if (isSending) {
        return
      }

      if (!message.trim()) {
        toast.warning("Digite a nova mensagem.")
        return
      }

      if (!canEditChatMessage(editingMessage, currentTime)) {
        setEditingMessage(null)
        setMessage("")
        return
      }

      setIsSending(true)

      try {
        const result = await postChatAction({
          action: "edit-message",
          instanceName: selectedConversation.instanceName,
          message: editingMessage,
          remoteJid: selectedConversation.remoteJid,
          text: message,
        })

        applyActionSnapshot(result.snapshot)
        setEditingMessage(null)
        setMessage("")
        toast.success("Mensagem editada.")
      } catch (error) {
        toast.error(getRequestErrorMessage(error))
      } finally {
        setIsSending(false)
      }

      return
    }

    if (!message.trim() && !media) {
      toast.warning("Digite uma mensagem ou selecione um arquivo.")
      return
    }

    const currentText = message
    const currentMedia = media
    const currentReplyTo = replyTo
    const optimisticMessage = createLocalOptimisticMessage({
      media: currentMedia,
      quoted: currentReplyTo,
      text: currentText,
    })

    setMessage("")
    setMedia(null)
    setEditingMessage(null)
    setReplyTo(null)
    setOptimisticMessages((current) => [...current, optimisticMessage])
    applyOptimisticPreview(optimisticMessage)
    queueOutgoingMessage({
      optimisticMessage,
      request: currentMedia
        ? {
            action: "send-media",
            caption: currentText,
            instanceName: selectedConversation.instanceName,
            media: currentMedia,
            quoted: currentReplyTo,
            remoteJid: selectedConversation.remoteJid,
          }
        : {
            action: "send-text",
            instanceName: selectedConversation.instanceName,
            quoted: currentReplyTo,
            remoteJid: selectedConversation.remoteJid,
            text: currentText,
          },
    })
  }

  function openUploadPicker(kind: UploadKind) {
    if (kind === "document") {
      documentUploadInputRef.current?.click()
      return
    }

    if (kind === "audio") {
      audioUploadInputRef.current?.click()
      return
    }

    mediaUploadInputRef.current?.click()
  }

  async function handleUpload(file: File | null, kind: UploadKind) {
    if (!file) {
      return
    }

    const mediatype = kind === "audio" ? "audio" : getUploadMediaType(file)

    if (kind === "media" && mediatype !== "image" && mediatype !== "video") {
      toast.warning("Selecione uma foto ou video.")
      return
    }

    if (kind === "audio" && mediatype !== "audio") {
      toast.warning("Selecione um arquivo de audio.")
      return
    }

    if (kind === "document" && mediatype !== "document") {
      toast.warning("Selecione um documento.")
      return
    }

    const dataUrl = await fileToDataUrl(file)

    if (mediatype === "audio") {
      setMessage("")
    }

    setMedia({
      fileName: file.name || fallbackFileName(mediatype),
      fileSize: String(file.size),
      media: dataUrl,
      mediatype,
      mimetype: file.type || defaultMimeType(mediatype),
    })
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  function stopRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
  }

  async function startAudioRecording() {
    if (editingMessage || media || message.trim()) {
      return
    }

    if (
      typeof window === "undefined" ||
      !("MediaRecorder" in window) ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      toast.warning("Gravacao de audio nao disponivel neste navegador.")
      return
    }

    try {
      if (recordingPreviewUrl) {
        URL.revokeObjectURL(recordingPreviewUrl)
      }

      setRecordingPreviewUrl("")
      setRecordedAudio(null)
      setRecordingSeconds(0)
      setIsRecordingFinalizing(false)
      recordingCanceledRef.current = false
      recordingChunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedAudioMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recordingStreamRef.current = stream
      mediaRecorderRef.current = recorder
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data)
        }
      })
      recorder.addEventListener("stop", () => {
        clearRecordingTimer()
        stopRecordingStream()

        if (recordingCanceledRef.current) {
          recordingCanceledRef.current = false
          recordingChunksRef.current = []
          setAudioRecorderState("idle")
          setIsRecordingFinalizing(false)
          return
        }

        void finalizeAudioRecording(recorder.mimeType || mimeType || "audio/webm")
      })

      recordingStartedAtRef.current = Date.now()
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(
          Math.max(1, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000))
        )
      }, 250)
      recorder.start()
      setRecordingSeconds(0)
      setAudioRecorderState("recording")
    } catch {
      stopRecordingStream()
      setAudioRecorderState("idle")
      toast.error("Nao foi possivel acessar o microfone.")
    }
  }

  async function finalizeAudioRecording(mimetype: string) {
    const blob = new Blob(recordingChunksRef.current, { type: mimetype })
    recordingChunksRef.current = []

    if (!blob.size) {
      setAudioRecorderState("idle")
      setIsRecordingFinalizing(false)
      toast.warning("Audio vazio.")
      return
    }

    const dataUrl = await blobToDataUrl(blob)
    const previewUrl = URL.createObjectURL(blob)
    const cleanMime = mimetype || blob.type || "audio/webm"
    const durationSeconds = Math.max(
      1,
      recordingSeconds,
      Math.round((Date.now() - recordingStartedAtRef.current) / 1000)
    )

    setRecordedAudio({
      audioSeconds: durationSeconds,
      fileName: fallbackFileName("audio"),
      media: dataUrl,
      mediatype: "audio",
      mimetype: cleanMime,
    })
    setRecordingPreviewUrl(previewUrl)
    setRecordingSeconds(durationSeconds)
    setAudioRecorderState("preview")
    setIsRecordingFinalizing(false)
  }

  function stopAudioRecording() {
    const recorder = mediaRecorderRef.current

    if (!recorder || recorder.state === "inactive") {
      return
    }

    setIsRecordingFinalizing(true)
    recorder.stop()
  }

  function cancelAudioRecording() {
    recordingCanceledRef.current = true
    clearRecordingTimer()
    stopRecordingStream()

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop()
    }

    if (recordingPreviewUrl) {
      URL.revokeObjectURL(recordingPreviewUrl)
    }

    setRecordedAudio(null)
    setRecordingPreviewUrl("")
    setRecordingSeconds(0)
    setIsRecordingFinalizing(false)
    setAudioRecorderState("idle")
  }

  async function sendRecordedAudio() {
    if (!selectedConversation || !recordedAudio) {
      return
    }

    const currentAudio = recordedAudio
    const currentReplyTo = replyTo
    const currentPreviewUrl = recordingPreviewUrl
    const optimisticMessage = createLocalOptimisticMessage({
      media: currentAudio,
      quoted: currentReplyTo,
      text: "",
    })

    setOptimisticMessages((current) => [...current, optimisticMessage])
    applyOptimisticPreview(optimisticMessage)
    setReplyTo(null)
    setRecordedAudio(null)
    setRecordingPreviewUrl("")
    setRecordingSeconds(0)
    setIsRecordingFinalizing(false)
    setAudioRecorderState("idle")

    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl)
    }

    queueOutgoingMessage({
      optimisticMessage,
      request: {
        action: "send-media",
        caption: "",
        instanceName: selectedConversation.instanceName,
        media: currentAudio,
        quoted: currentReplyTo,
        remoteJid: selectedConversation.remoteJid,
      },
    })
  }

  async function handleCopyMessage(chatMessage: WhatsAppChatMessage) {
    await navigator.clipboard.writeText(
      chatMessage.text || messageTypeLabel(chatMessage.type)
    )
    toast.success("Mensagem copiada.")
  }

  async function handleReactMessage(
    chatMessage: WhatsAppChatMessage,
    reaction: string
  ) {
    if (!selectedConversation) {
      return
    }

    try {
      await postChatAction({
        action: "send-reaction",
        instanceName: selectedConversation.instanceName,
        message: chatMessage,
        reaction,
      })
      toast.success("Reacao enviada.")
      await fetchMessages({
        instanceName: selectedConversation.instanceName,
        remoteJid: selectedConversation.remoteJid,
        silent: true,
      })
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    }
  }

  function handleReplyMessage(chatMessage: WhatsAppChatMessage) {
    setReplyTo(chatMessage)
    messageInputRef.current?.focus()
  }

  function handleForwardMessage(chatMessage: WhatsAppChatMessage) {
    cancelDeleteSelection()
    setIsForwardSelectionMode(true)
    setIsForwardDialogOpen(false)
    setSelectedForwardMessageKeys([getMessageSelectionKey(chatMessage)])
    setForwardQuery("")
    setSelectedForwardKeys([])
  }

  function cancelForwardSelection() {
    setIsForwardSelectionMode(false)
    setIsForwardDialogOpen(false)
    setSelectedForwardMessageKeys([])
    setSelectedForwardKeys([])
    setForwardQuery("")
  }

  function toggleForwardMessageSelection(chatMessage: WhatsAppChatMessage) {
    const key = getMessageSelectionKey(chatMessage)

    setSelectedForwardMessageKeys((current) => {
      if (!current.includes(key)) {
        return [...current, key]
      }

      const next = current.filter((item) => item !== key)

      if (!next.length) {
        setIsForwardSelectionMode(false)
        setIsForwardDialogOpen(false)
        setSelectedForwardKeys([])
      }

      return next
    })
  }

  function openForwardDialog() {
    if (!selectedForwardMessages.length) {
      return
    }

    setForwardQuery("")
    setSelectedForwardKeys([])
    setIsForwardDialogOpen(true)
  }

  function toggleForwardTarget(target: WhatsAppConversation) {
    const key = getConversationKey(target)
    const limit = getForwardBatchTargetLimit(selectedForwardMessages)

    setSelectedForwardKeys((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key)
      }

      if (current.length >= limit) {
        toast.warning(getForwardLimitMessage(limit))
        return current
      }

      return [...current, key]
    })
  }

  function scrollToMessage(chatMessage: WhatsAppChatMessage) {
    const target =
      messageRefs.current[chatMessage.id] ||
      (chatMessage.keyId ? messageRefs.current[chatMessage.keyId] : null)

    if (!target) {
      toast.info("Mensagem ainda nao esta carregada neste chat.")
      return
    }

    setHighlightedMessageId(chatMessage.keyId ?? chatMessage.id)
    target.scrollIntoView({ behavior: "smooth", block: "center" })
    window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === (chatMessage.keyId ?? chatMessage.id) ? "" : current
      )
    }, 1600)
  }

function applyActionSnapshot(nextSnapshot: WhatsAppChatSnapshot) {
    snapshotRef.current = nextSnapshot
    setSnapshot(nextSnapshot)
    const selectedMessagesPayload = nextSnapshot.selected

    if (selectedMessagesPayload) {
      const payloadKey = makeConversationKey(
        selectedMessagesPayload.instanceName,
        selectedMessagesPayload.remoteJid
      )

      setMessagesByConversation((current) => ({
        ...current,
        [payloadKey]: mergeFreshMessagesWithCached(
          current[payloadKey] ?? [],
          selectedMessagesPayload.messages
        ),
      }))
      setMessagePaginationByConversation((current) => ({
        ...current,
        [payloadKey]: {
          hasMore:
            current[payloadKey]?.hasMore ??
            (Boolean(selectedMessagesPayload.hasMore) ||
              selectedMessagesPayload.messages.length >= DEFAULT_MESSAGES_PAGE_SIZE),
          isLoading: false,
        },
      }))
      reconcileOptimisticMessagesWithServer(
        selectedMessagesPayload.instanceName,
        selectedMessagesPayload.remoteJid,
        selectedMessagesPayload.messages
      )
    }
  }

  function reconcileOptimisticMessagesWithServer(
    instanceName: string,
    remoteJid: string,
    serverMessages: WhatsAppChatMessage[]
  ) {
    setOptimisticMessages((current) =>
      removeMatchedOptimisticMessages(
        current,
        instanceName,
        remoteJid,
        serverMessages
      )
    )
  }

  function createLocalOptimisticMessage({
    media,
    quoted,
    text,
  }: {
    media: WhatsAppMediaPayload | null
    quoted?: WhatsAppChatMessage | null
    text: string
  }) {
    if (!selectedConversation) {
      throw new Error("Selecione uma conversa.")
    }

    optimisticMessageSequenceRef.current += 1
    const sequence = optimisticMessageSequenceRef.current
    const timestampMs = Math.max(Date.now(), optimisticTimestampRef.current + 1)

    optimisticTimestampRef.current = timestampMs

    return createOptimisticMessage({
      id: `temp-${timestampMs}-${String(sequence).padStart(6, "0")}`,
      instanceName: selectedConversation.instanceName,
      media,
      quoted,
      remoteJid: selectedConversation.remoteJid,
      text,
      timestamp: new Date(timestampMs).toISOString(),
    })
  }

  function enqueueSend(task: () => Promise<void>) {
    const queuedTask = sendQueueRef.current
      .catch(() => undefined)
      .then(task)

    sendQueueRef.current = queuedTask.catch(() => undefined)
  }

  function applyOptimisticPreview(chatMessage: WhatsAppChatMessage) {
    const key = makeConversationKey(
      chatMessage.instanceName,
      chatMessage.remoteJid
    )

    setSnapshot((current) =>
      current
        ? updateSnapshotConversationFromMessages(current, key, [chatMessage])
        : current
    )
  }

  function updateOptimisticMessageStatus(
    optimisticId: string,
    status: string
  ) {
    setOptimisticMessages((current) =>
      current.map((chatMessage) =>
        chatMessage.id === optimisticId
          ? { ...chatMessage, status }
          : chatMessage
      )
    )
  }

  function queueOutgoingMessage({
    optimisticMessage,
    request,
  }: {
    optimisticMessage: WhatsAppChatMessage
    request: Record<string, unknown>
  }) {
    enqueueSend(async () => {
      try {
        const result = await postChatAction(request)

        applyActionSnapshot(result.snapshot)

        const selectedMessagesPayload = result.snapshot.selected
        const serverMessages =
          selectedMessagesPayload?.instanceName ===
            optimisticMessage.instanceName &&
          selectedMessagesPayload.remoteJid === optimisticMessage.remoteJid
            ? selectedMessagesPayload.messages
            : []

        if (hasMatchingServerMessage(serverMessages, optimisticMessage)) {
          setOptimisticMessages((current) =>
            current.filter(
              (chatMessage) => chatMessage.id !== optimisticMessage.id
            )
          )
          return
        }

        updateOptimisticMessageStatus(optimisticMessage.id, "SENT")
        applyOptimisticPreview({ ...optimisticMessage, status: "SENT" })

        window.setTimeout(() => {
          void fetchMessages({
            instanceName: optimisticMessage.instanceName,
            remoteJid: optimisticMessage.remoteJid,
            silent: true,
          })
        }, 700)
      } catch (error) {
        updateOptimisticMessageStatus(optimisticMessage.id, "ERROR")
        applyOptimisticPreview({ ...optimisticMessage, status: "ERROR" })
        toast.error(getRequestErrorMessage(error))
      }
    })
  }

  async function handleForwardSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedForwardMessages.length) {
      return
    }

    if (!selectedForwardTargets.length) {
      toast.warning("Selecione pelo menos uma conversa ou grupo.")
      return
    }

    const limit = getForwardBatchTargetLimit(selectedForwardMessages)

    if (selectedForwardTargets.length > limit) {
      toast.warning(getForwardLimitMessage(limit))
      return
    }

    setIsForwarding(true)

    try {
      const forwardItems = []

      for (const messageToForward of selectedForwardMessages) {
        const text = getForwardMessageText(messageToForward)
        const mediaPayload = messageToForward.mediaUrl
          ? await createForwardMediaPayload(messageToForward)
          : null

        if (text || mediaPayload) {
          forwardItems.push({
            mediaPayload,
            text,
          })
        }
      }

      if (!forwardItems.length) {
        toast.warning("As mensagens selecionadas nao possuem conteudo para encaminhar.")
        return
      }

      for (const target of selectedForwardTargets) {
        for (const item of forwardItems) {
          if (item.mediaPayload) {
            await postChatAction({
              action: "send-media",
              caption: item.text,
              instanceName: target.instanceName,
              media: item.mediaPayload,
              remoteJid: target.remoteJid,
            })
          } else {
            await postChatAction({
              action: "send-text",
              instanceName: target.instanceName,
              remoteJid: target.remoteJid,
              text: item.text,
            })
          }
        }
      }

      const messageCount = forwardItems.length

      cancelForwardSelection()
      toast.success(
        messageCount === 1 && selectedForwardTargets.length === 1
          ? "Mensagem encaminhada."
          : `${messageCount} ${
              messageCount === 1 ? "mensagem encaminhada" : "mensagens encaminhadas"
            } para ${selectedForwardTargets.length} ${
              selectedForwardTargets.length === 1 ? "conversa" : "conversas"
            }.`
      )

      if (selectedConversation) {
        await fetchSnapshot({
          instanceName: selectedConversation.instanceName,
          remoteJid: selectedConversation.remoteJid,
          silent: true,
        })
      }
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    } finally {
      setIsForwarding(false)
    }
  }

  function handleEditMessage(chatMessage: WhatsAppChatMessage) {
    if (!chatMessage.fromMe || !chatMessage.text || chatMessage.isDeletedForEveryone) {
      toast.info("Apenas mensagens de texto enviadas por voce podem ser editadas.")
      return
    }

    if (!canEditChatMessage(chatMessage, currentTime)) {
      return
    }

    setMessage(chatMessage.text)
    setEditingMessage(chatMessage)
    setMedia(null)
    setReplyTo(null)
    messageInputRef.current?.focus()
  }

  function handleReportMessage() {
    toast.info("Denuncia de mensagem entra na proxima etapa.")
  }

  function setFavoriteState(
    chatMessage: WhatsAppChatMessage,
    isFavorite: boolean
  ) {
    const favoritedAt = isFavorite ? new Date().toISOString() : null
    const updateMessage = (messageItem: WhatsAppChatMessage) =>
      isSameWhatsAppMessage(messageItem, chatMessage)
        ? { ...messageItem, favoritedAt, isFavorite }
        : messageItem

    setMessagesByConversation((current) => {
      const next = { ...current }

      for (const [key, messages] of Object.entries(next)) {
        next[key] = messages.map(updateMessage)
      }

      return next
    })
    setSnapshot((current) =>
      current
        ? {
            ...current,
            selected: current.selected
              ? {
                  ...current.selected,
                  messages: current.selected.messages.map(updateMessage),
                }
              : current.selected,
          }
        : current
    )
  }

  function setPinState(
    chatMessage: WhatsAppChatMessage,
    isPinned: boolean,
    durationHours = Number(pinDuration)
  ) {
    const pinnedAt = isPinned ? new Date().toISOString() : null
    const pinnedExpiresAt = isPinned
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
      : null
    const updateMessage = (messageItem: WhatsAppChatMessage) =>
      isSameWhatsAppMessage(messageItem, chatMessage)
        ? { ...messageItem, isPinned, pinnedAt, pinnedExpiresAt }
        : messageItem

    setMessagesByConversation((current) => {
      const next = { ...current }

      for (const [key, messages] of Object.entries(next)) {
        next[key] = messages.map(updateMessage)
      }

      return next
    })
    setSnapshot((current) =>
      current
        ? {
            ...current,
            selected: current.selected
              ? {
                  ...current.selected,
                  messages: current.selected.messages.map(updateMessage),
                }
              : current.selected,
          }
        : current
    )
  }

  async function handleFavoriteMessage(chatMessage: WhatsAppChatMessage) {
    if (!selectedConversation) {
      return
    }

    const nextFavoriteState = !chatMessage.isFavorite

    setFavoriteState(chatMessage, nextFavoriteState)

    try {
      const result = await postChatAction({
        action: "toggle-favorite",
        instanceName: selectedConversation.instanceName,
        message: chatMessage,
        remoteJid: selectedConversation.remoteJid,
      })

      setSnapshot(result.snapshot)
      const selectedMessagesPayload = result.snapshot.selected

      if (selectedMessagesPayload) {
        setMessagesByConversation((current) => ({
          ...current,
          [makeConversationKey(
            selectedMessagesPayload.instanceName,
            selectedMessagesPayload.remoteJid
          )]: selectedMessagesPayload.messages,
        }))
      }

      toast.success(
        nextFavoriteState
          ? "Mensagem adicionada as favoritas."
          : "Mensagem removida das favoritas."
      )
    } catch (error) {
      setFavoriteState(chatMessage, !nextFavoriteState)
      toast.error(getRequestErrorMessage(error))
    }
  }

  function handlePinMessage(chatMessage: WhatsAppChatMessage) {
    if (chatMessage.isPinned) {
      void handlePinSubmit(chatMessage)
      return
    }

    if (pinnedMessages.length >= 3) {
      toast.warning(
        "Este chat ja tem 3 mensagens fixadas. Desafixe uma para adicionar outra."
      )
      return
    }

    setPinDuration("168")
    setPinMessage(chatMessage)
  }

  async function handlePinSubmit(chatMessage = pinMessage) {
    if (!selectedConversation || !chatMessage) {
      return
    }

    const nextPinState = !chatMessage.isPinned
    const durationHours = Number(pinDuration)

    setIsPinning(true)
    setPinState(chatMessage, nextPinState, durationHours)

    try {
      const result = await postChatAction({
        action: "toggle-pin",
        instanceName: selectedConversation.instanceName,
        message: chatMessage,
        pinDurationHours: durationHours,
        remoteJid: selectedConversation.remoteJid,
      })

      setSnapshot(result.snapshot)
      const selectedMessagesPayload = result.snapshot.selected

      if (selectedMessagesPayload) {
        setMessagesByConversation((current) => ({
          ...current,
          [makeConversationKey(
            selectedMessagesPayload.instanceName,
            selectedMessagesPayload.remoteJid
          )]: selectedMessagesPayload.messages,
        }))
      }

      setPinMessage(null)
      toast.success(
        nextPinState ? "Mensagem fixada." : "Mensagem desafixada."
      )
    } catch (error) {
      setPinState(chatMessage, !nextPinState, durationHours)
      toast.error(getRequestErrorMessage(error))
    } finally {
      setIsPinning(false)
    }
  }

  async function handleDeleteMessage(chatMessage: WhatsAppChatMessage) {
    cancelForwardSelection()
    setIsDeleteSelectionMode(true)
    setIsDeleteConfirmOpen(false)
    setSelectedDeleteMessageKeys([getMessageSelectionKey(chatMessage)])
  }

  function cancelDeleteSelection() {
    setIsDeleteSelectionMode(false)
    setIsDeleteConfirmOpen(false)
    setSelectedDeleteMessageKeys([])
  }

  function toggleDeleteSelection(chatMessage: WhatsAppChatMessage) {
    const key = getMessageSelectionKey(chatMessage)

    setSelectedDeleteMessageKeys((current) => {
      if (!current.includes(key)) {
        return [...current, key]
      }

      const next = current.filter((item) => item !== key)

      if (!next.length) {
        setIsDeleteSelectionMode(false)
        setIsDeleteConfirmOpen(false)
      }

      return next
    })
  }

  function openDeleteConfirm() {
    if (!selectedDeleteMessages.length) {
      return
    }

    setIsDeleteConfirmOpen(true)
  }

  async function handleRestoreDeletedMessage(chatMessage: WhatsAppChatMessage) {
    try {
      const result = await postChatAction({
        action: "restore-message-for-me",
        instanceName: chatMessage.instanceName,
        message: chatMessage,
        remoteJid: chatMessage.remoteJid,
      })

      applyActionSnapshot(result.snapshot)
      toast.success("Mensagem restaurada.")
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    }
  }

  async function handleDeleteSubmit(mode: "everyone" | "me") {
    if (!selectedConversation || !selectedDeleteMessages.length) {
      return
    }

    if (mode === "everyone" && !canDeleteSelectionForEveryone) {
      toast.warning("So e possivel apagar para todos mensagens suas dentro do prazo.")
      return
    }

    const messagesToDelete = selectedDeleteMessages

    setIsDeleting(true)

    try {
      let lastSnapshot: WhatsAppChatSnapshot | null = null

      for (const messageToDelete of messagesToDelete) {
        const result = await postChatAction({
          action: mode === "everyone" ? "delete-for-everyone" : "delete-for-me",
          instanceName: selectedConversation.instanceName,
          message: messageToDelete,
          remoteJid: selectedConversation.remoteJid,
        })

        lastSnapshot = result.snapshot
      }

      if (lastSnapshot) {
        applyActionSnapshot(lastSnapshot)
      }

      setIsDeleteConfirmOpen(false)
      setIsDeleteSelectionMode(false)
      setSelectedDeleteMessageKeys([])

      if (mode === "me") {
        const canRestore = messagesToDelete.length === 1

        toast.success(
          messagesToDelete.length === 1
            ? "Mensagem apagada para voce."
            : `${messagesToDelete.length} mensagens apagadas para voce.`,
          canRestore
            ? {
                action: {
                  label: "Desfazer",
                  onClick: () =>
                    void handleRestoreDeletedMessage(messagesToDelete[0]),
                },
              }
            : undefined
        )
      } else {
        toast.success(
          messagesToDelete.length === 1
            ? "Pedido para apagar para todos enviado."
            : `Pedido para apagar ${messagesToDelete.length} mensagens para todos enviado.`
        )
      }
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleClearConversation() {
    if (!selectedConversation) {
      return
    }

    if (!window.confirm("Limpar esta conversa apenas da sua tela?")) {
      return
    }

    try {
      const result = await postChatAction({
        action: "clear-conversation-for-me",
        instanceName: selectedConversation.instanceName,
        remoteJid: selectedConversation.remoteJid,
      })

      applyActionSnapshot(result.snapshot)
      toast.success("Conversa limpa para voce.")
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    }
  }

  async function handleToggleContactBlock() {
    if (!selectedConversation) {
      return
    }

    const nextBlocked = !isContactBlocked
    const confirmed = window.confirm(
      nextBlocked
        ? `Bloquear ${selectedConversation.name}?`
        : `Desbloquear ${selectedConversation.name}?`
    )

    if (!confirmed) {
      return
    }

    setIsContactBlocked(nextBlocked)

    try {
      await postChatAction({
        action: "update-block-status",
        blocked: nextBlocked,
        instanceName: selectedConversation.instanceName,
        remoteJid: selectedConversation.remoteJid,
      })
      toast.success(nextBlocked ? "Contato bloqueado." : "Contato desbloqueado.")
    } catch (error) {
      setIsContactBlocked(!nextBlocked)
      toast.error(getRequestErrorMessage(error))
    }
  }

  if (isLoading && !snapshot) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Carregando conversas...
        </div>
      </section>
    )
  }

  if (!snapshot) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
        <div className="flex flex-1 items-center justify-center">
          <Button type="button" onClick={() => void fetchSnapshot()}>
            <RefreshCwIcon />
            Tentar novamente
          </Button>
        </div>
      </section>
    )
  }

  const forwardLimit = getForwardBatchTargetLimit(selectedForwardMessages)
  const forwardSelectedCount = selectedForwardKeys.length

  function openMediaViewer(chatMessage: WhatsAppChatMessage) {
    setMediaViewerMessageId(getMessageMediaKey(chatMessage))
  }

  function showMediaViewerItem(direction: "next" | "previous") {
    if (!visualMediaItems.length || mediaViewerIndex < 0) {
      return
    }

    const offset = direction === "next" ? 1 : -1
    const nextIndex =
      (mediaViewerIndex + offset + visualMediaItems.length) %
      visualMediaItems.length

    setMediaViewerMessageId(getMessageMediaKey(visualMediaItems[nextIndex]))
  }

  return (
    <>
    <section
      className={cn(
        "grid h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background",
        isInfoOpen
          ? "lg:grid-cols-[380px_minmax(0,1fr)_360px]"
          : "lg:grid-cols-[380px_minmax(0,1fr)]"
      )}
    >
      <aside className="flex min-h-0 flex-col overflow-hidden border-b border-border/80 bg-card/30 lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-border/80 p-3">
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 gap-2 text-[11px] text-muted-foreground">
              <MetricPill
                icon={MessageCircleIcon}
                label={`${snapshot.conversations.filter((conversation) => conversation.kind === "contact").length}`}
              />
              <MetricPill
                icon={SmartphoneIcon}
                label={`${snapshot.totals.instances}`}
              />
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <ComboboxSelect
                value={instanceFilter}
                options={instanceOptions}
                className="h-8 w-[172px]"
                onChange={(value) => void handleChangeInstanceFilter(value)}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={openStartDialog}
              >
                <PlusIcon />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={isSyncing}
                onClick={() =>
                  void fetchSnapshot({
                    instanceName: selectedConversation?.instanceName,
                    remoteJid: selectedConversation?.remoteJid,
                  })
                }
              >
                {isSyncing ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <RefreshCwIcon />
                )}
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="relative min-w-0">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                placeholder="Pesquisar conversa"
                className="h-9 rounded-lg bg-background pl-9"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredConversations.length ? (
            <div className="divide-y divide-border/70">
              {filteredConversations.map((conversation) => {
                const isSelected =
                  getConversationKey(conversation) ===
                  getConversationKey(selectedConversation)

                return (
                  <button
                    key={getConversationKey(conversation)}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40",
                      isSelected && "bg-muted/70"
                    )}
                    onClick={() => void handleSelectConversation(conversation)}
                  >
                    <AvatarBubble conversation={conversation} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {conversation.name}
                        </span>
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        {conversation.lastMessageFromMe ? (
                          <MessageStatus status={conversation.lastMessageStatus} />
                        ) : null}
                        <span className="min-w-0 truncate">
                          {conversation.lastMessageFromMe ? "Voce: " : ""}
                          {conversation.lastMessageText || "Sem mensagens"}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatConversationTime(
                          conversation.lastMessageAt ?? conversation.updatedAt
                        )}
                      </span>
                      {conversation.unreadMessages ? (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                          {conversation.unreadMessages}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Nenhuma conversa encontrada.
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-border/80 bg-card/50 px-4 py-3">
                <AvatarBubble conversation={selectedConversation} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {selectedConversation.name}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant={isChatSearchOpen ? "secondary" : "ghost"}
                  onClick={() => setIsChatSearchOpen((current) => !current)}
                >
                  <SearchIcon />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setIsInfoOpen(true)}
                >
                  <InfoIcon />
                </Button>
              </div>

              {isChatSearchOpen && !media ? (
                <div className="shrink-0 border-b border-border/80 bg-background p-2">
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={chatSearch}
                        placeholder="Pesquisar nesta conversa"
                        className="h-9 pl-9"
                        onChange={(event) => {
                          setChatSearch(event.target.value)
                          setChatSearchIndex(0)
                        }}
                      />
                    </div>
                    <span className="w-16 text-center text-xs text-muted-foreground">
                      {chatSearch
                        ? `${chatSearchResults.length ? chatSearchIndex + 1 : 0}/${chatSearchResults.length}`
                        : ""}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={!chatSearchResults.length}
                      onClick={() =>
                        setChatSearchIndex((current) =>
                          current <= 0 ? chatSearchResults.length - 1 : current - 1
                        )
                      }
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={!chatSearchResults.length}
                      onClick={() =>
                        setChatSearchIndex((current) =>
                          current >= chatSearchResults.length - 1 ? 0 : current + 1
                        )
                      }
                    >
                      <ChevronDownIcon />
                    </Button>
                  </div>
                </div>
              ) : null}

              {media ? (
                <MediaUploadPreview media={media} onClear={() => setMedia(null)} />
              ) : (
                <>
                  {pinnedMessages.length ? (
                    <PinnedMessagesBanner
                      messages={pinnedMessages}
                      onSelect={scrollToMessage}
                    />
                  ) : null}

                  <div
                    ref={messagesScrollRef}
                    className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,var(--muted)_1px,transparent_0)] bg-[length:22px_22px] px-4 py-4"
                    onScroll={handleMessagesScroll}
                  >
                    <div className="flex w-full flex-col gap-2">
                      {isLoadingOlderMessages ? (
                        <div className="mx-auto flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                          <Loader2Icon className="size-3.5 animate-spin" />
                          Carregando mensagens antigas...
                        </div>
                      ) : null}
                      {visibleMessages.length ? (
                        visibleMessages.map((chatMessage, index) => (
                          <React.Fragment key={chatMessage.id}>
                            {shouldShowDateSeparator(visibleMessages, index) ? (
                              <DateSeparator value={chatMessage.timestamp} />
                            ) : null}
                            <div
                              ref={(node) => {
                                messageRefs.current[chatMessage.id] = node

                                if (chatMessage.keyId) {
                                  messageRefs.current[chatMessage.keyId] = node
                                }
                              }}
                            >
                              <MessageBubble
                                conversation={selectedConversation}
                                isHighlighted={
                                  highlightedMessageId ===
                                  (chatMessage.keyId ?? chatMessage.id)
                                }
                                isDeleteSelectionMode={isDeleteSelectionMode}
                                isForwardSelectionMode={isForwardSelectionMode}
                                isSelectedForForward={selectedForwardMessageKeys.includes(
                                  getMessageSelectionKey(chatMessage)
                                )}
                                isSelectedForDelete={selectedDeleteMessageKeys.includes(
                                  getMessageSelectionKey(chatMessage)
                                )}
                                message={chatMessage}
                                onCopy={() => void handleCopyMessage(chatMessage)}
                                onDelete={() => void handleDeleteMessage(chatMessage)}
                                onEdit={() => handleEditMessage(chatMessage)}
                                onFavorite={() => handleFavoriteMessage(chatMessage)}
                                onForward={() => handleForwardMessage(chatMessage)}
                                onOpenMedia={() => openMediaViewer(chatMessage)}
                                onPin={() => handlePinMessage(chatMessage)}
                                onReact={(reaction) =>
                                  void handleReactMessage(chatMessage, reaction)
                                }
                                onReport={() => handleReportMessage()}
                                onReply={() => handleReplyMessage(chatMessage)}
                                onToggleForwardSelection={() =>
                                  toggleForwardMessageSelection(chatMessage)
                                }
                                onToggleDeleteSelection={() =>
                                  toggleDeleteSelection(chatMessage)
                                }
                                currentTime={currentTime}
                              />
                            </div>
                          </React.Fragment>
                        ))
                      ) : isSelectedConversationLoading ? (
                        <div className="rounded-lg border border-dashed border-border bg-background/70 p-6 text-center text-sm text-muted-foreground">
                          <Loader2Icon className="mx-auto mb-2 size-4 animate-spin" />
                          Carregando mensagens...
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                          Nenhuma mensagem sincronizada nesta conversa.
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>
                </>
              )}

              {isDeleteSelectionMode ? (
                <DeleteSelectionToolbar
                  count={selectedDeleteCount}
                  onCancel={cancelDeleteSelection}
                  onDelete={openDeleteConfirm}
                />
              ) : isForwardSelectionMode ? (
                <ForwardSelectionToolbar
                  count={selectedForwardMessageCount}
                  onCancel={cancelForwardSelection}
                  onForward={openForwardDialog}
                />
              ) : (
              <form
                className="shrink-0 border-t border-border/80 bg-card/50 p-3"
                onSubmit={(event) => void handleSendMessage(event)}
              >
                {editingMessage ? (
                  <EditComposerPreview
                    message={editingMessage}
                    onClear={() => {
                      setEditingMessage(null)
                      setMessage("")
                    }}
                  />
                ) : null}
                {replyTo ? (
                  <ReplyComposerPreview
                    conversation={selectedConversation}
                    message={replyTo}
                    onClear={() => setReplyTo(null)}
                  />
                ) : null}
                {media ? (
                  <MediaUploadComposer
                    isSending={isSending}
                    media={media}
                    message={message}
                    onMessageChange={setMessage}
                    onOpenUpload={openUploadPicker}
                  />
                ) : audioRecorderState !== "idle" ? (
                  <AudioRecorderComposer
                    duration={recordingSeconds}
                    isSending={false}
                    isFinalizing={isRecordingFinalizing}
                    previewUrl={recordingPreviewUrl}
                    state={audioRecorderState}
                    onCancel={cancelAudioRecording}
                    onSend={() => void sendRecordedAudio()}
                    onStop={stopAudioRecording}
                  />
                ) : (
                <div className="flex items-end gap-2">
                  <AttachmentMenu
                    disabled={Boolean(editingMessage)}
                    onSelect={openUploadPicker}
                  />
                  <Button type="button" size="icon-lg" variant="ghost">
                    <SmileIcon />
                  </Button>
                  <Textarea
                    ref={messageInputRef}
                    value={message}
                    placeholder={
                      editingMessage
                        ? "Edite sua mensagem"
                        : media
                          ? "Legenda opcional"
                          : "Digite uma mensagem"
                    }
                    rows={1}
                    disabled={Boolean(editingMessage && isSending)}
                    className="max-h-32 min-h-9 resize-none rounded-lg bg-background"
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        event.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <Button
                    type={message.trim() || media ? "submit" : "button"}
                    size="icon-lg"
                    disabled={Boolean(editingMessage && isSending)}
                    aria-label={message.trim() || media ? "Enviar" : "Gravar audio"}
                    onClick={
                      message.trim() || media
                        ? undefined
                        : () => void startAudioRecording()
                    }
                  >
                    {editingMessage && isSending ? (
                      <Loader2Icon className="animate-spin" />
                    ) : message.trim() || media ? (
                      <SendIcon />
                    ) : (
                      <MicIcon />
                    )}
                  </Button>
                </div>
                )}
                <UploadInputs
                  audioRef={audioUploadInputRef}
                  documentRef={documentUploadInputRef}
                  mediaRef={mediaUploadInputRef}
                  onUpload={(file, kind) => void handleUpload(file, kind)}
                />
              </form>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa para comecar.
            </div>
          )}
      </div>

      {isInfoOpen && selectedConversation ? (
        <ContactInfoPanel
          contactNote={contactNote}
          conversation={selectedConversation}
          documentCount={contactDocumentItems.length}
          documentItems={contactDocumentItems}
          favoriteCount={favoriteMessages.length}
          favoriteMessages={favoriteMessages}
          isEditingNote={isEditingContactNote}
          isBlocked={isContactBlocked}
          isFavorite={isContactFavorite}
          isMuted={isContactMuted}
          linkCount={contactLinkItems.length}
          linkItems={contactLinkItems}
          mediaPanelTab={mediaPanelTab}
          mediaCount={contactMediaItems.length}
          mediaItems={contactMediaItems}
          messageCount={selectedMessages.length}
          onClose={() => {
            setIsInfoOpen(false)
            setContactPanelView("details")
          }}
          onEditNoteChange={setIsEditingContactNote}
          onClearConversation={() => void handleClearConversation()}
          onNoteChange={setContactNote}
          onOpenChatSearch={() => {
            setIsChatSearchOpen(true)
            setContactPanelView("details")
          }}
          onRequestAction={(message) => toast.info(message)}
          onToggleBlock={() => void handleToggleContactBlock()}
          onToggleFavorite={() => setIsContactFavorite((current) => !current)}
          onToggleMute={() => setIsContactMuted((current) => !current)}
          setMediaPanelTab={setMediaPanelTab}
          setView={setContactPanelView}
          view={contactPanelView}
        />
      ) : null}
    </section>
    {mediaViewerMessage && selectedConversation ? (
      <MediaViewerOverlay
        conversation={selectedConversation}
        currentIndex={mediaViewerIndex}
        items={visualMediaItems}
        message={mediaViewerMessage}
        onClose={() => setMediaViewerMessageId("")}
        onNext={() => showMediaViewerItem("next")}
        onPrevious={() => showMediaViewerItem("previous")}
        onSelect={(chatMessage) =>
          setMediaViewerMessageId(getMessageMediaKey(chatMessage))
        }
      />
    ) : null}
    <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Iniciar conversa</DialogTitle>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void handleStartConversation(event)}>
          <div className="grid gap-2">
            <Label>WhatsApp</Label>
            <ComboboxSelect
              value={startInstanceName}
              options={startInstanceOptions}
              onChange={setStartInstanceName}
            />
          </div>
          <div className="grid gap-2">
            <Label>Numero ou contato</Label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={startQuery}
                placeholder="Digite o numero ou pesquise pelo nome"
                className="pl-9"
                onChange={(event) => setStartQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {manualStartOption || startContacts.length ? (
              <>
              {manualStartOption ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-2 text-left hover:bg-muted/40"
                  onClick={() => void startConversation(manualStartOption)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <PlusIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      Usar este numero
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {manualStartOption.formattedNumber}
                    </span>
                  </span>
                  <CheckIcon className="size-4 text-muted-foreground" />
                </button>
              ) : null}
              {startContacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
                  onClick={() =>
                    void startConversation({
                      formattedNumber: contact.formattedNumber,
                      instanceDisplayName: contact.instanceDisplayName,
                      instanceName: contact.instanceName,
                      name: contact.name,
                      number: contact.number,
                      profilePicUrl: contact.profilePicUrl,
                      remoteJid: contact.remoteJid,
                    })
                  }
                >
                  <ContactAvatar contact={contact} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {contact.name || contact.formattedNumber}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {contact.formattedNumber}
                    </span>
                  </span>
                  <CheckIcon className="size-4 text-muted-foreground" />
                </button>
              ))}
              </>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Digite um numero ou pesquise um contato desta instancia.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsStartDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!manualStartOption}>
              <PlusIcon />
              Iniciar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog
      open={isForwardDialogOpen}
      onOpenChange={(open) => {
        if (!open && !isForwarding) {
          setIsForwardDialogOpen(false)
          setSelectedForwardKeys([])
        }
      }}
    >
      <DialogContent className="max-h-[86vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Encaminhar mensagens</DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-4"
          onSubmit={(event) => void handleForwardSubmit(event)}
        >
          {selectedForwardMessageCount ? (
            <div className="rounded-lg border border-border bg-background/70 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                <span>
                  {selectedForwardMessageCount}{" "}
                  {selectedForwardMessageCount === 1
                    ? "mensagem selecionada"
                    : "mensagens selecionadas"}
                </span>
                {selectedForwardMessages.some(isHighlyForwarded) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                    <ForwardIcon className="size-3" />
                    Encaminhada muitas vezes
                  </span>
                ) : null}
              </div>
              <div className="grid max-h-28 gap-1 overflow-y-auto">
                {selectedForwardMessages.slice(0, 6).map((messageToForward) => (
                  <div
                    key={getMessageSelectionKey(messageToForward)}
                    className="line-clamp-1 text-muted-foreground"
                  >
                    {messageToForward.text || messageTypeLabel(messageToForward.type)}
                  </div>
                ))}
                {selectedForwardMessageCount > 6 ? (
                  <div className="text-xs text-muted-foreground">
                    +{selectedForwardMessageCount - 6} mensagens
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={forwardQuery}
              placeholder="Pesquisar contato ou grupo"
              className="pl-9"
              onChange={(event) => setForwardQuery(event.target.value)}
            />
          </div>

          <div className="min-h-0 max-h-80 overflow-y-auto rounded-lg border border-border">
            {forwardTargets.length ? (
              <div className="divide-y divide-border/70">
                {forwardTargets.map((target) => {
                  const targetKey = getConversationKey(target)
                  const isSelected = selectedForwardKeys.includes(targetKey)

                  return (
                    <button
                      key={targetKey}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/40",
                        isSelected && "bg-primary/10"
                      )}
                      onClick={() => toggleForwardTarget(target)}
                    >
                      <AvatarBubble conversation={target} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {target.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {target.kind === "group" ? (
                            <UsersIcon className="size-3.5" />
                          ) : (
                            <MessageCircleIcon className="size-3.5" />
                          )}
                          {target.kind === "group" ? "Grupo" : target.formattedNumber}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border border-border",
                          isSelected && "border-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {isSelected ? <CheckIcon className="size-3.5" /> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Nenhum contato ou grupo encontrado.
              </div>
            )}
          </div>

          <DialogFooter className="items-center gap-3">
            <div className="mr-auto text-xs text-muted-foreground">
              {forwardSelectedCount}/{forwardLimit} selecionadas
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isForwarding}
              onClick={() => {
                setIsForwardDialogOpen(false)
                setSelectedForwardKeys([])
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isForwarding ||
                forwardSelectedCount === 0 ||
                forwardSelectedCount > forwardLimit
              }
            >
              {isForwarding ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <ForwardIcon />
              )}
              Encaminhar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog
      open={isDeleteConfirmOpen}
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          setIsDeleteConfirmOpen(false)
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deseja apagar as mensagens?</DialogTitle>
        </DialogHeader>
        {selectedDeleteCount ? (
          <p className="text-sm text-muted-foreground">
            {selectedDeleteCount}{" "}
            {selectedDeleteCount === 1
              ? "mensagem selecionada"
              : "mensagens selecionadas"}
          </p>
        ) : null}
        {canDeleteSelectionForEveryone ? (
          <DialogFooter className="gap-2 sm:flex-col sm:items-end">
            <Button
              type="button"
              variant="outline"
              className="min-w-40 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              disabled={isDeleting}
              onClick={() => void handleDeleteSubmit("everyone")}
            >
              {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
              Apagar para todos
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-w-40 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
              disabled={isDeleting}
              onClick={() => void handleDeleteSubmit("me")}
            >
              {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
              Apagar para mim
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-w-40 text-primary hover:bg-primary/10 hover:text-primary"
              disabled={isDeleting}
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Cancelar
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="text-primary hover:bg-primary/10 hover:text-primary"
              disabled={isDeleting}
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isDeleting}
              onClick={() => void handleDeleteSubmit("me")}
            >
              {isDeleting ? <Loader2Icon className="animate-spin" /> : null}
              Apagar para mim
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
    <Dialog
      open={Boolean(pinMessage)}
      onOpenChange={(open) => {
        if (!open && !isPinning) {
          setPinMessage(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fixar mensagem?</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handlePinSubmit()
          }}
        >
          {pinMessage ? (
            <div className="rounded-lg bg-background/70 p-3 text-sm">
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Mensagem selecionada
              </div>
              <div className="line-clamp-3 whitespace-pre-wrap">
                {pinMessage.text || messageTypeLabel(pinMessage.type)}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>Duração</Label>
            <div className="grid gap-2">
              {PIN_DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition hover:bg-muted/40",
                    pinDuration === option.value &&
                      "border-primary bg-primary/10"
                  )}
                  onClick={() => setPinDuration(option.value)}
                >
                  <span>
                    <span className="block text-sm font-semibold">
                      {option.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                  {pinDuration === option.value ? (
                    <CheckIcon className="size-4 text-primary" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPinning}
              onClick={() => setPinMessage(null)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPinning}>
              {isPinning ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PinIcon />
              )}
              Fixar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}

function MessageBubble({
  conversation,
  currentTime,
  isHighlighted,
  isDeleteSelectionMode,
  isForwardSelectionMode,
  isSelectedForDelete,
  isSelectedForForward,
  message,
  onCopy,
  onDelete,
  onEdit,
  onFavorite,
  onForward,
  onOpenMedia,
  onPin,
  onReact,
  onReport,
  onReply,
  onToggleDeleteSelection,
  onToggleForwardSelection,
}: {
  conversation: WhatsAppConversation
  currentTime: number
  isHighlighted: boolean
  isDeleteSelectionMode: boolean
  isForwardSelectionMode: boolean
  isSelectedForDelete: boolean
  isSelectedForForward: boolean
  message: WhatsAppChatMessage
  onCopy: () => void
  onDelete: () => void
  onEdit: () => void
  onFavorite: () => void
  onForward: () => void
  onOpenMedia: () => void
  onPin: () => void
  onReact: (reaction: string) => void
  onReport: () => void
  onReply: () => void
  onToggleDeleteSelection: () => void
  onToggleForwardSelection: () => void
}) {
  const isDeleted = Boolean(message.isDeletedForEveryone)
  const canEdit = canEditChatMessage(message, currentTime)
  const mediaCaption = message.mediaUrl ? getMediaCaption(message) : ""
  const shouldShowMessageText =
    !isDeleted && (message.mediaUrl ? Boolean(mediaCaption) : true)
  const isSelectionMode = isDeleteSelectionMode || isForwardSelectionMode
  const isSelected = isDeleteSelectionMode
    ? isSelectedForDelete
    : isSelectedForForward
  const onToggleSelection = isDeleteSelectionMode
    ? onToggleDeleteSelection
    : onToggleForwardSelection

  return (
    <div
      className={cn(
        "group/message",
        isSelectionMode
          ? "grid grid-cols-[2rem_1fr] items-start gap-2"
          : "flex items-start gap-1",
        !isSelectionMode &&
          (message.fromMe ? "justify-end" : "justify-start")
      )}
    >
      {isSelectionMode ? (
        <button
          type="button"
          aria-label={
            isSelected
              ? "Remover mensagem da selecao"
              : "Selecionar mensagem"
          }
          className={cn(
            "mt-2 flex size-5 items-center justify-center rounded border transition",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/50 bg-background/80 text-transparent hover:border-primary"
          )}
          onClick={onToggleSelection}
        >
          <CheckIcon className="size-3.5" />
        </button>
      ) : null}
      <div
        className={cn(
          isSelectionMode && "flex min-w-0",
          message.fromMe ? "justify-end" : "justify-start"
        )}
      >
      <div
        className={cn(
          "max-w-[min(72%,680px)] rounded-lg px-3 py-2 text-sm shadow-sm transition",
          message.fromMe
            ? "rounded-tr-sm bg-primary/20 text-foreground"
            : "bg-card text-foreground",
          "relative pr-8",
          isHighlighted && "ring-2 ring-primary/70"
        )}
      >
        {!message.fromMe && conversation.kind === "group" ? (
          <div className="mb-1 text-xs font-medium text-primary">
            {message.senderName}
          </div>
        ) : null}
        {!isDeleted && message.isForwarded ? (
          <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <ForwardIcon className="size-3" />
            {getForwardedLabel(message)}
          </div>
        ) : null}
        {isDeleted ? (
          <div className="flex items-center gap-2 italic text-muted-foreground">
            <Trash2Icon className="size-4" />
            {message.text}
          </div>
        ) : null}
        {!isDeleted && message.quoted ? (
          <ReplyQuote conversation={conversation} message={message} />
        ) : null}
        {!isDeleted && message.mediaUrl ? (
          <MessageMediaPreview message={message} onOpen={onOpenMedia} />
        ) : null}
        {shouldShowMessageText ? (
          <div className="whitespace-pre-wrap break-words">
            {message.mediaUrl
              ? mediaCaption
              : message.text || messageTypeLabel(message.type)}
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          {message.isPinned ? (
            <PinIcon className="size-3 text-muted-foreground" />
          ) : null}
          {message.isFavorite ? (
            <StarIcon className="size-3 fill-current text-muted-foreground" />
          ) : null}
          {message.isEdited ? <span>editada</span> : null}
          <span>{formatShortTime(message.timestamp)}</span>
          {message.fromMe ? <MessageStatus status={message.status} /> : null}
        </div>
        {message.reaction ? (
          <div className="mt-1 inline-flex rounded-full bg-background px-1.5 py-0.5 text-xs shadow-sm">
            {message.reaction}
          </div>
        ) : null}
        {isSelectionMode ? null : (
          <MessageActions
            align={message.fromMe ? "end" : "start"}
            canEdit={canEdit}
            fromMe={message.fromMe}
            isDeleted={isDeleted}
            isFavorite={Boolean(message.isFavorite)}
            isPinned={Boolean(message.isPinned)}
            isMediaMessage={Boolean(message.mediaUrl)}
            onCopy={onCopy}
            onDelete={onDelete}
            onEdit={onEdit}
            onFavorite={onFavorite}
            onForward={onForward}
            onPin={onPin}
            onReact={onReact}
            onReport={onReport}
            onReply={onReply}
          />
        )}
      </div>
      </div>
    </div>
  )
}

function EditComposerPreview({
  message,
  onClear,
}: {
  message: WhatsAppChatMessage
  onClear: () => void
}) {
  return (
    <div className="mb-2 flex overflow-hidden rounded-lg bg-background/80 shadow-sm">
      <div className="w-1 shrink-0 bg-primary" />
      <div className="min-w-0 flex-1 px-3 py-2">
        <div className="truncate text-xs font-semibold text-primary">
          Editando mensagem
        </div>
        <div className="line-clamp-1 text-sm text-muted-foreground">
          {message.text || messageTypeLabel(message.type)}
        </div>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="m-2 shrink-0"
        onClick={onClear}
      >
        <XIcon />
      </Button>
    </div>
  )
}

function ReplyComposerPreview({
  conversation,
  message,
  onClear,
}: {
  conversation: WhatsAppConversation
  message: WhatsAppChatMessage
  onClear: () => void
}) {
  const senderName = getDirectMessageSenderName(message, conversation)
  const isMine = message.fromMe

  return (
    <div className="mb-2 flex overflow-hidden rounded-lg bg-background/80 shadow-sm">
      <div
        className={cn(
          "w-1 shrink-0",
          isMine ? "bg-primary" : "bg-rose-400"
        )}
      />
      <div className="min-w-0 flex-1 px-3 py-2">
        <div
          className={cn(
            "truncate text-xs font-semibold",
            isMine ? "text-primary" : "text-rose-400"
          )}
        >
          {senderName}
        </div>
        <div className="line-clamp-1 text-sm text-muted-foreground">
          {message.text || messageTypeLabel(message.type)}
        </div>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="m-2 shrink-0"
        onClick={onClear}
      >
        <XIcon />
      </Button>
    </div>
  )
}

function PinnedMessagesBanner({
  messages,
  onSelect,
}: {
  messages: WhatsAppChatMessage[]
  onSelect: (message: WhatsAppChatMessage) => void
}) {
  const latest = messages[0]

  if (!latest) {
    return null
  }

  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-3 border-b border-border/80 bg-card/80 px-4 py-2 text-left transition hover:bg-muted/40"
      onClick={() => onSelect(latest)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <PinIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-semibold text-primary">
          Mensagem fixada
          {messages.length > 1 ? (
            <span className="text-muted-foreground">{messages.length}/3</span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-sm text-foreground">
          {latest.text || messageTypeLabel(latest.type)}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        Expira {formatPinnedExpiration(latest.pinnedExpiresAt)}
      </span>
    </button>
  )
}

function ReplyQuote({
  conversation,
  message,
}: {
  conversation: WhatsAppConversation
  message: WhatsAppChatMessage
}) {
  if (!message.quoted) {
    return null
  }

  const senderName = getQuotedMessageSenderName(message, conversation)
  const isMine = senderName === "Voce"

  return (
    <div className="mb-2 flex overflow-hidden rounded-md bg-background/65">
      <div
        className={cn(
          "w-1 shrink-0",
          isMine ? "bg-primary" : "bg-rose-400"
        )}
      />
      <div className="min-w-0 px-2.5 py-1.5">
        <div
          className={cn(
            "truncate text-xs font-semibold",
            isMine ? "text-primary" : "text-rose-400"
          )}
        >
          {senderName}
        </div>
        <div className="line-clamp-2 text-xs text-muted-foreground">
          {message.quoted.text || "Mensagem"}
        </div>
      </div>
    </div>
  )
}

function ContactInfoPanel({
  contactNote,
  conversation,
  documentCount,
  documentItems,
  favoriteCount,
  favoriteMessages,
  isBlocked,
  isEditingNote,
  isFavorite,
  isMuted,
  linkCount,
  linkItems,
  mediaPanelTab,
  mediaCount,
  mediaItems,
  messageCount,
  onClearConversation,
  onClose,
  onEditNoteChange,
  onNoteChange,
  onOpenChatSearch,
  onRequestAction,
  onToggleBlock,
  onToggleFavorite,
  onToggleMute,
  setMediaPanelTab,
  setView,
  view,
}: {
  contactNote: string
  conversation: WhatsAppConversation
  documentCount: number
  documentItems: WhatsAppChatMessage[]
  favoriteCount: number
  favoriteMessages: WhatsAppChatMessage[]
  isBlocked: boolean
  isEditingNote: boolean
  isFavorite: boolean
  isMuted: boolean
  linkCount: number
  linkItems: WhatsAppChatMessage[]
  mediaPanelTab: MediaPanelTab
  mediaCount: number
  mediaItems: WhatsAppChatMessage[]
  messageCount: number
  onClearConversation: () => void
  onClose: () => void
  onEditNoteChange: (value: boolean) => void
  onNoteChange: (value: string) => void
  onOpenChatSearch: () => void
  onRequestAction: (message: string) => void
  onToggleBlock: () => void
  onToggleFavorite: () => void
  onToggleMute: () => void
  setMediaPanelTab: (tab: MediaPanelTab) => void
  setView: (view: ContactPanelView) => void
  view: ContactPanelView
}) {
  if (view === "media") {
    const activeItems =
      mediaPanelTab === "documents"
        ? documentItems
        : mediaPanelTab === "links"
          ? linkItems
          : mediaItems

    return (
      <aside className="hidden min-h-0 flex-col overflow-hidden border-l border-border/80 bg-card/30 lg:flex">
        <PanelHeader
          title="Midia, links e docs"
          onBack={() => setView("details")}
        />
        <div className="grid grid-cols-3 border-b border-border/80 text-sm">
          <button
            type="button"
            className={cn(
              "px-3 py-3",
              mediaPanelTab === "media"
                ? "border-b border-primary text-primary"
                : "text-muted-foreground"
            )}
            onClick={() => setMediaPanelTab("media")}
          >
            Midia
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-3",
              mediaPanelTab === "documents"
                ? "border-b border-primary text-primary"
                : "text-muted-foreground"
            )}
            onClick={() => setMediaPanelTab("documents")}
          >
            Documentos
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-3",
              mediaPanelTab === "links"
                ? "border-b border-primary text-primary"
                : "text-muted-foreground"
            )}
            onClick={() => setMediaPanelTab("links")}
          >
            Links
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeItems.length ? (
            <MediaPanelContent
              documents={documentItems}
              links={linkItems}
              media={mediaItems}
              tab={mediaPanelTab}
            />
          ) : (
            <EmptyPanelState
              icon={
                mediaPanelTab === "documents"
                  ? FileIcon
                  : mediaPanelTab === "links"
                    ? MessageCircleIcon
                    : ImageIcon
              }
              title={
                mediaPanelTab === "documents"
                  ? "Nenhum documento"
                  : mediaPanelTab === "links"
                    ? "Nenhum link"
                    : "Nenhuma midia"
              }
              description={
                mediaPanelTab === "documents"
                  ? "Os documentos compartilhados na conversa aparecerao aqui."
                  : mediaPanelTab === "links"
                    ? "Os links compartilhados na conversa aparecerao aqui."
                    : "As midias compartilhadas na conversa aparecerao aqui."
              }
            />
          )}
        </div>
        <div className="border-t border-border/80 p-4 text-center text-sm font-medium text-primary">
          Mostrar {mediaPanelTab === "links"
            ? "links"
            : mediaPanelTab === "documents"
              ? "documentos"
              : "midias"} de todas as conversas
        </div>
      </aside>
    )
  }

  if (view === "favorites") {
    return (
      <aside className="hidden min-h-0 flex-col overflow-hidden border-l border-border/80 bg-card/30 lg:flex">
        <PanelHeader
          title="Mensagens favoritas"
          onBack={() => setView("details")}
        />
        <div className="border-b border-border/80 p-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Pesquisar" className="rounded-full pl-9" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {favoriteMessages.length ? (
            <div className="divide-y divide-border/80">
              {favoriteMessages.map((favorite) => (
                <div key={favorite.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold">
                      {favorite.fromMe ? "Voce" : favorite.senderName} ▸ Voce
                    </span>
                    <span className="text-muted-foreground">
                      {formatShortDate(favorite.timestamp)}
                    </span>
                  </div>
                  <div className="inline-flex max-w-[84%] flex-col rounded-lg bg-primary/20 px-3 py-2 text-sm">
                    <span>{favorite.text || messageTypeLabel(favorite.type)}</span>
                    <span className="mt-1 text-right text-xs text-muted-foreground">
                      ★ {formatConversationTime(favorite.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Nenhuma mensagem favorita
            </div>
          )}
        </div>
      </aside>
    )
  }

  return (
    <aside className="hidden min-h-0 flex-col overflow-hidden border-l border-border/80 bg-card/30 lg:flex">
      <PanelHeader
        title="Dados do contato"
        onClose={onClose}
        action={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onEditNoteChange(true)}
          >
            <PencilIcon />
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <div className="flex flex-col items-center border-b border-border/80 py-5 text-center">
          <AvatarBubble conversation={conversation} large />
          <div className="mt-4 text-xl font-semibold">{conversation.name}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {conversation.formattedNumber}
          </div>
          <Button
            type="button"
            className="mt-4 min-w-40"
            variant="outline"
            onClick={onOpenChatSearch}
          >
            <SearchIcon />
            Pesquisar
          </Button>
        </div>

        <div className="border-b border-border/80 py-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Adicione notas sobre seu cliente.
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onEditNoteChange(!isEditingNote)}
            >
              <PencilIcon />
            </Button>
          </div>
          {isEditingNote ? (
            <Textarea
              value={contactNote}
              rows={3}
              placeholder="Notas internas sobre este contato"
              onChange={(event) => onNoteChange(event.target.value)}
            />
          ) : contactNote ? (
            <div className="rounded-lg bg-background p-3 text-sm">
              {contactNote}
            </div>
          ) : null}
        </div>

        <div className="grid border-b border-border/80 py-2">
          <ContactPanelRow
            icon={ImageIcon}
            label="Midia, links e docs"
            value={`${mediaCount + documentCount + linkCount}`}
            onClick={() => {
              setMediaPanelTab("media")
              setView("media")
            }}
          />
          <ContactPanelRow
            icon={StarIcon}
            label="Mensagens favoritas"
            value={`${favoriteCount}`}
            onClick={() => setView("favorites")}
          />
          <ContactPanelRow
            icon={BellIcon}
            label="Silenciar notificacoes"
            control={
              <SwitchVisual checked={isMuted} onClick={onToggleMute} />
            }
          />
          <ContactPanelRow
            icon={TimerIcon}
            label="Mensagens temporarias"
            description="Desativadas"
          />
          <ContactPanelRow
            icon={ShieldIcon}
            label="Privacidade avancada da conversa"
            description="Desativada"
          />
          <ContactPanelRow
            icon={LockIcon}
            label="Criptografia"
            description="As mensagens sao protegidas com a criptografia de ponta a ponta."
          />
        </div>

        <div className="grid border-b border-border/80 py-3">
          <div className="px-1 pb-2 text-xs font-medium text-muted-foreground">
            Resumo sincronizado
          </div>
          <InfoCard label="WhatsApp" value={conversation.instanceDisplayName} />
          <InfoCard label="Mensagens" value={`${messageCount}`} />
          <InfoCard
            label="Ultima mensagem"
            value={
              conversation.lastMessageAt
                ? formatShortTime(conversation.lastMessageAt)
                : "Sem mensagens"
            }
          />
        </div>

        <div className="grid py-3">
          <ContactPanelRow
            icon={HeartIcon}
            label={isFavorite ? "Remover dos Favoritos" : "Adicionar aos Favoritos"}
            onClick={onToggleFavorite}
          />
          <ContactPanelRow
            danger
            icon={Trash2Icon}
            label="Limpar conversa"
            onClick={onClearConversation}
          />
          <ContactPanelRow
            danger
            icon={BanIcon}
            label={`${isBlocked ? "Desbloquear" : "Bloquear"} ${conversation.name}`}
            onClick={onToggleBlock}
          />
          <ContactPanelRow
            danger
            icon={FlagIcon}
            label={`Denunciar ${conversation.name}`}
            onClick={() =>
              onRequestAction(
                "A Evolution nao expoe denuncia nativa. Bloqueie o contato e finalize a denuncia no WhatsApp oficial."
              )
            }
          />
          <ContactPanelRow
            danger
            icon={Trash2Icon}
            label="Apagar conversa"
            onClick={onClearConversation}
          />
        </div>
      </div>
    </aside>
  )
}

function MediaPanelContent({
  documents,
  links,
  media,
  tab,
}: {
  documents: WhatsAppChatMessage[]
  links: WhatsAppChatMessage[]
  media: WhatsAppChatMessage[]
  tab: MediaPanelTab
}) {
  if (tab === "documents") {
    return (
      <div className="divide-y divide-border/80">
        {documents.map((document) => (
          <a
            key={document.id}
            href={document.mediaUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="block px-5 py-4 hover:bg-muted/30"
          >
            <div className="rounded-lg bg-background p-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive text-xs font-bold text-destructive-foreground">
                  PDF
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {document.fileName || "Documento"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {document.mimetype?.split("/").at(-1)?.toUpperCase() ??
                      "ARQUIVO"}
                    {document.fileSize ? ` - ${formatFileSize(document.fileSize)}` : ""}
                  </span>
                </span>
              </div>
            </div>
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {formatShortDate(document.timestamp)}
            </div>
          </a>
        ))}
      </div>
    )
  }

  if (tab === "links") {
    return (
      <div className="divide-y divide-border/80">
        {links.map((linkMessage) => {
          const urls = extractUrls(linkMessage.text)
          const firstUrl = urls[0] ?? linkMessage.text

          return (
            <div key={linkMessage.id} className="px-5 py-4">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">
                  {linkMessage.fromMe ? "Voce" : linkMessage.senderName} ▸ Voce
                </span>
                <span className="text-muted-foreground">
                  {formatShortDate(linkMessage.timestamp)}
                </span>
              </div>
              <a
                href={firstUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg bg-background p-3 hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted">
                    <MessageCircleIcon className="size-5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold">
                      {firstUrl}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {getUrlHost(firstUrl)}
                    </span>
                  </span>
                </div>
              </a>
              <a
                href={firstUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block break-all text-sm text-primary underline-offset-2 hover:underline"
              >
                {firstUrl}
              </a>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="p-4">
      {groupMessagesByMonth(media).map((group) => (
        <div key={group.label} className="mb-5">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            {group.label}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {group.items.map((item) => (
              <a
                key={item.id}
                href={item.mediaUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="aspect-square overflow-hidden rounded-md bg-background"
              >
                {item.type.includes("image") ? (
                  <MediaImage
                    alt={item.fileName ?? "Midia"}
                    className="size-full object-cover"
                    src={item.mediaUrl ?? ""}
                  />
                ) : (
                  <span className="relative flex size-full items-center justify-center">
                    <VideoIcon className="size-6 text-muted-foreground" />
                    <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 text-[10px]">
                      {formatConversationTime(item.timestamp)}
                    </span>
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PanelHeader({
  action,
  onBack,
  onClose,
  title,
}: {
  action?: React.ReactNode
  onBack?: () => void
  onClose?: () => void
  title: string
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/80 px-3">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={onBack ?? onClose}
      >
        {onBack ? <ArrowLeftIcon /> : <XIcon />}
      </Button>
      <div className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</div>
      {action}
    </div>
  )
}

function ContactPanelRow({
  control,
  danger = false,
  description,
  icon: Icon,
  label,
  onClick,
  value,
}: {
  control?: React.ReactNode
  danger?: boolean
  description?: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  value?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-4 rounded-md px-1 py-3 text-left text-sm transition hover:bg-muted/40",
        danger && "text-destructive"
      )}
      disabled={!onClick && !control}
      onClick={onClick}
    >
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {control ?? (
        value ? <span className="text-sm text-muted-foreground">{value}</span> : null
      )}
    </button>
  )
}

function SwitchVisual({
  checked,
  onClick,
}: {
  checked: boolean
  onClick: () => void
}) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border border-border transition",
        checked ? "bg-primary" : "bg-muted"
      )}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <span
        className={cn(
          "size-4 rounded-full bg-background transition",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </span>
  )
}

function EmptyPanelState({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: React.ComponentType<{ className?: string }>
  title: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
      <Icon className="mb-3 size-6" />
      <div className="font-semibold text-foreground">{title}</div>
      <div className="mt-1 max-w-56">{description}</div>
    </div>
  )
}

function AttachmentMenu({
  disabled,
  onSelect,
}: {
  disabled?: boolean
  onSelect: (kind: UploadKind) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label="Anexar arquivo"
        className="inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
      >
        <PlusIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuItem
          className="gap-3"
          onSelect={(event) => {
            event.preventDefault()
            onSelect("document")
          }}
        >
          <FileIcon className="size-4 text-primary" />
          Documento
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-3"
          onSelect={(event) => {
            event.preventDefault()
            onSelect("media")
          }}
        >
          <ImageIcon className="size-4 text-primary" />
          Fotos e videos
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-3"
          onSelect={(event) => {
            event.preventDefault()
            onSelect("audio")
          }}
        >
          <MicIcon className="size-4 text-primary" />
          <span className="flex flex-col">
            <span>Audio</span>
            <span className="text-xs text-muted-foreground">
              Mensagem de audio
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UploadInputs({
  audioRef,
  documentRef,
  mediaRef,
  onUpload,
}: {
  audioRef: React.RefObject<HTMLInputElement | null>
  documentRef: React.RefObject<HTMLInputElement | null>
  mediaRef: React.RefObject<HTMLInputElement | null>
  onUpload: (file: File | null, kind: UploadKind) => void
}) {
  return (
    <>
      <input
        ref={documentRef}
        type="file"
        className="sr-only"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          onUpload(event.target.files?.[0] ?? null, "document")
          event.currentTarget.value = ""
        }}
      />
      <input
        ref={mediaRef}
        type="file"
        className="sr-only"
        accept="image/*,video/*"
        onChange={(event) => {
          onUpload(event.target.files?.[0] ?? null, "media")
          event.currentTarget.value = ""
        }}
      />
      <input
        ref={audioRef}
        type="file"
        className="sr-only"
        accept="audio/*,.mp3,.m4a,.ogg,.oga,.wav,.aac,.opus,.webm"
        onChange={(event) => {
          onUpload(event.target.files?.[0] ?? null, "audio")
          event.currentTarget.value = ""
        }}
      />
    </>
  )
}

function DeleteSelectionToolbar({
  count,
  onCancel,
  onDelete,
}: {
  count: number
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-border/80 bg-card px-4 py-3">
      <Button type="button" size="icon-lg" variant="ghost" onClick={onCancel}>
        <XIcon />
      </Button>
      <div className="min-w-0 flex-1 text-sm font-semibold">
        {count} {count === 1 ? "selecionada" : "selecionadas"}
      </div>
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        disabled={count === 0}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}

function ForwardSelectionToolbar({
  count,
  onCancel,
  onForward,
}: {
  count: number
  onCancel: () => void
  onForward: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-border/80 bg-card px-4 py-3">
      <Button type="button" size="icon-lg" variant="ghost" onClick={onCancel}>
        <XIcon />
      </Button>
      <div className="min-w-0 flex-1 text-sm font-semibold">
        {count} {count === 1 ? "selecionada" : "selecionadas"}
      </div>
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        disabled={count === 0}
        onClick={onForward}
      >
        <ForwardIcon />
      </Button>
    </div>
  )
}

function MediaUploadPreview({
  media,
  onClear,
}: {
  media: WhatsAppMediaPayload
  onClear: () => void
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center bg-background px-6 py-8">
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        className="absolute left-4 top-4 text-muted-foreground"
        onClick={onClear}
      >
        <XIcon />
      </Button>
      {media.mediatype === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.media}
          alt={media.fileName}
          className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
        />
      ) : media.mediatype === "video" ? (
        <video
          src={media.media}
          controls
          className="max-h-full max-w-full rounded-md bg-black shadow-2xl"
        />
      ) : media.mediatype === "audio" ? (
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-2xl">
          <div className="flex size-20 items-center justify-center rounded-full bg-primary/15 text-primary">
            <MicIcon className="size-9" />
          </div>
          <div>
            <div className="text-lg font-semibold">Mensagem de audio</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {media.fileName}
            </div>
          </div>
          <audio src={media.media} controls className="w-full" />
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col items-center rounded-lg border border-border bg-primary/10 p-10 text-center shadow-2xl">
          <FileIcon className="size-20 text-primary" />
          <div className="mt-8 text-2xl font-medium">Previa indisponivel</div>
          <div className="mt-2 text-sm text-muted-foreground">
            {[formatFileSize(media.fileSize), getFileExtension(media.fileName)]
              .filter(Boolean)
              .join(" - ")}
          </div>
        </div>
      )}
    </div>
  )
}

function MediaUploadComposer({
  isSending,
  media,
  message,
  onMessageChange,
  onOpenUpload,
}: {
  isSending: boolean
  media: WhatsAppMediaPayload
  message: string
  onMessageChange: (value: string) => void
  onOpenUpload: (kind: UploadKind) => void
}) {
  const canWriteCaption = media.mediatype !== "audio"

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
        {canWriteCaption ? (
          <Textarea
            value={message}
            placeholder="Digite uma mensagem"
            rows={1}
            className="max-h-32 min-h-10 resize-none rounded-lg bg-background"
            onChange={(event) => onMessageChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />
        ) : (
          <div className="flex min-h-10 flex-1 items-center rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
            Mensagem de audio
          </div>
        )}
        {canWriteCaption ? (
          <Button type="button" size="icon-lg" variant="ghost">
            <SmileIcon />
          </Button>
        ) : null}
      </div>
      <div className="flex items-center justify-center gap-2">
        <MediaUploadThumbnail media={media} />
        <AttachmentMenu onSelect={onOpenUpload} />
        <Button
          type="submit"
          size="icon-lg"
          className="ml-4 size-14 rounded-full"
          disabled={isSending}
          aria-label="Enviar arquivo"
        >
          {isSending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        </Button>
      </div>
    </div>
  )
}

function MediaUploadThumbnail({ media }: { media: WhatsAppMediaPayload }) {
  return (
    <div className="flex size-14 items-center justify-center overflow-hidden rounded-md border border-primary bg-background text-primary">
      {media.mediatype === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.media} alt={media.fileName} className="size-full object-cover" />
      ) : media.mediatype === "video" ? (
        <video src={media.media} className="size-full object-cover" muted />
      ) : (
        <MediaIcon mediatype={media.mediatype} />
      )}
    </div>
  )
}

function DateSeparator({ value }: { value?: string | null }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-md bg-card/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
        {formatMessageDate(value)}
      </span>
    </div>
  )
}

function MessageStatus({ status }: { status?: string | null }) {
  const state = getDeliveryState(status)

  if (state === "error") {
    return <XIcon className="size-3.5 text-destructive" />
  }

  if (state === "pending") {
    return <TimerIcon className="size-3.5 text-muted-foreground" />
  }

  if (state === "read") {
    return <CheckCheckIcon className="size-3.5 text-sky-400" />
  }

  if (state === "delivered") {
    return <CheckCheckIcon className="size-3.5 text-muted-foreground" />
  }

  return <CheckIcon className="size-3.5 text-muted-foreground" />
}

function getDeliveryState(status?: string | null) {
  const normalized = String(status ?? "").trim().toUpperCase()

  if (normalized === "PENDING" || normalized === "SENDING") {
    return "pending"
  }

  if (
    normalized === "READ" ||
    normalized === "PLAYED" ||
    normalized === "READ_ACK" ||
    normalized === "MESSAGE_READ" ||
    normalized === "4" ||
    normalized === "5"
  ) {
    return "read"
  }

  if (
    normalized === "DELIVERED" ||
    normalized === "DELIVERY_ACK" ||
    normalized === "MESSAGE_DELIVERED" ||
    normalized === "3"
  ) {
    return "delivered"
  }

  if (normalized === "ERROR" || normalized === "FAILED") {
    return "error"
  }

  return "sent"
}

function MessageActions({
  align,
  canEdit,
  fromMe,
  isDeleted,
  isFavorite,
  isMediaMessage,
  isPinned,
  onCopy,
  onDelete,
  onEdit,
  onFavorite,
  onForward,
  onPin,
  onReact,
  onReport,
  onReply,
}: {
  align: "end" | "start"
  canEdit: boolean
  fromMe: boolean
  isDeleted: boolean
  isFavorite: boolean
  isMediaMessage: boolean
  isPinned: boolean
  onCopy: () => void
  onDelete: () => void
  onEdit: () => void
  onFavorite: () => void
  onForward: () => void
  onPin: () => void
  onReact: (reaction: string) => void
  onReport: () => void
  onReply: () => void
}) {
  const triggerClassName = cn(
    "absolute right-1 top-1 z-20 size-7 rounded-full opacity-0 shadow-sm backdrop-blur-sm transition group-hover/message:opacity-100 data-[state=open]:opacity-100",
    isMediaMessage
      ? "bg-black/30 text-white hover:bg-black/50 hover:text-white"
      : "bg-background/65 text-muted-foreground hover:bg-background/90 hover:text-foreground"
  )

  if (isDeleted) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className={triggerClassName}
            />
          }
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-52">
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon />
            Apagar para mim
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className={triggerClassName}
          />
        }
      >
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-52">
        <DropdownMenuItem onClick={onReply}>
          <ReplyIcon />
          Responder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}>
          <CopyIcon />
          Copiar
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SmileIcon />
            Reagir
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="grid min-w-40 grid-cols-5 gap-1">
            {["👍", "❤️", "😂", "😮", "🙏", "⭐"].map((reaction) => (
              <DropdownMenuItem
                key={reaction}
                className="justify-center text-base"
                onClick={() => onReact(reaction)}
              >
                {reaction}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={onForward}>
          <ForwardIcon />
          Encaminhar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPin}>
          <PinIcon />
          {isPinned ? "Desafixar" : "Fixar"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onFavorite}>
          <StarIcon />
          {isFavorite ? "Desfavoritar" : "Favoritar"}
        </DropdownMenuItem>
        {fromMe && canEdit ? (
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon />
            Editar
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {!fromMe ? (
          <DropdownMenuItem variant="destructive" onClick={onReport}>
            <FlagIcon />
            Denunciar
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon />
          Apagar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MessageMediaPreview({
  message,
  onOpen,
}: {
  message: WhatsAppChatMessage
  onOpen: () => void
}) {
  const mediaType = messageTypeToMediaType(message.type)

  if (mediaType === "image") {
    return (
      <button
        type="button"
        className="group/media relative mb-2 block aspect-square w-[min(68vw,18rem)] overflow-hidden rounded-md bg-black/80 text-left"
        onClick={onOpen}
      >
        <MediaImage
          src={message.mediaUrl ?? ""}
          alt={message.fileName ?? "Imagem"}
          className="size-full object-cover transition duration-200 group-hover/media:scale-[1.02]"
        />
      </button>
    )
  }

  if (mediaType === "video") {
    return (
      <button
        type="button"
        className="group/media relative mb-2 block aspect-square w-[min(68vw,18rem)] overflow-hidden rounded-md bg-black/80 text-left"
        onClick={onOpen}
      >
        <video
          muted
          playsInline
          preload="metadata"
          src={message.mediaUrl ?? ""}
          className="size-full object-cover transition duration-200 group-hover/media:scale-[1.02]"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/10">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg">
            <PlayIcon className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      </button>
    )
  }

  if (mediaType === "audio") {
    return (
      <WhatsAppAudioPlayer
        className="mb-2"
        duration={message.audioSeconds ?? undefined}
        src={message.mediaUrl ?? ""}
      />
    )
  }

  return (
    <a
      href={message.mediaUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="mb-2 flex items-center gap-2 rounded-md bg-background/70 p-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <FileIcon className="size-4" />
      <span>{message.fileName || messageTypeLabel(message.type)}</span>
    </a>
  )
}

function MediaViewerOverlay({
  conversation,
  currentIndex,
  items,
  message,
  onClose,
  onNext,
  onPrevious,
  onSelect,
}: {
  conversation: WhatsAppConversation
  currentIndex: number
  items: WhatsAppChatMessage[]
  message: WhatsAppChatMessage
  onClose: () => void
  onNext: () => void
  onPrevious: () => void
  onSelect: (message: WhatsAppChatMessage) => void
}) {
  const overlayRef = React.useRef<HTMLDivElement | null>(null)
  const mediaType = messageTypeToMediaType(message.type)
  const caption = getMediaCaption(message)
  const canNavigate = items.length > 1
  const senderName = message.fromMe ? "Voce" : conversation.name

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }

      if (event.key === "ArrowLeft" && canNavigate) {
        onPrevious()
      }

      if (event.key === "ArrowRight" && canNavigate) {
        onNext()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canNavigate, onClose, onNext, onPrevious])

  function handleFullscreen() {
    const element = overlayRef.current

    if (!element || !element.requestFullscreen) {
      return
    }

    void element.requestFullscreen().catch(() => undefined)
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col bg-[#111b21] text-white"
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarBubble conversation={conversation} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{senderName}</div>
            <div className="truncate text-xs text-white/65">
              {formatMediaViewerTimestamp(message.timestamp)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            aria-label="Abrir em tela cheia"
            onClick={handleFullscreen}
          >
            <Maximize2Icon />
          </Button>
          {message.mediaUrl ? (
            <a
              href={message.mediaUrl}
              download={message.fileName || fallbackFileName(mediaType)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-9 items-center justify-center rounded-lg text-white transition hover:bg-white/10"
              aria-label="Baixar midia"
            >
              <DownloadIcon className="size-4" />
            </a>
          ) : null}
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-4 pt-2 lg:px-16">
        {canNavigate ? (
          <>
            <button
              type="button"
              className="absolute left-4 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/70"
              aria-label="Midia anterior"
              onClick={onPrevious}
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              className="absolute right-4 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/70"
              aria-label="Proxima midia"
              onClick={onNext}
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        ) : null}

        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          {mediaType === "image" ? (
            <MediaImage
              alt={message.fileName ?? "Midia"}
              src={message.mediaUrl ?? ""}
              className="max-h-[calc(100vh-13rem)] max-w-[min(92vw,980px)] rounded-sm object-contain"
            />
          ) : (
            <video
              controls
              autoPlay
              playsInline
              src={message.mediaUrl ?? ""}
              className="max-h-[calc(100vh-13rem)] max-w-[min(92vw,980px)] rounded-sm object-contain"
            />
          )}
        </div>

        {caption ? (
          <div className="mt-3 max-w-[min(92vw,980px)] text-center text-sm text-white/85">
            {caption}
          </div>
        ) : null}
        <div className="mt-3 text-xs tabular-nums text-white/70">
          {currentIndex + 1} de {items.length}
        </div>
      </div>

      <div className="h-24 shrink-0 border-t border-white/10 bg-black/25 px-4 py-2">
        <div className="flex h-full items-center gap-2 overflow-x-auto">
          {items.map((item, index) => {
            const itemMediaType = messageTypeToMediaType(item.type)
            const isActive = getMessageMediaKey(item) === getMessageMediaKey(message)

            return (
              <button
                key={getMessageMediaKey(item)}
                type="button"
                className={cn(
                  "relative size-16 shrink-0 overflow-hidden rounded-sm bg-white/10 opacity-65 ring-2 ring-transparent transition hover:opacity-100",
                  isActive && "opacity-100 ring-primary"
                )}
                aria-label={`Abrir midia ${index + 1}`}
                onClick={() => onSelect(item)}
              >
                {itemMediaType === "image" ? (
                  <MediaImage
                    alt={item.fileName ?? "Midia"}
                    src={item.mediaUrl ?? ""}
                    className="size-full object-cover"
                  />
                ) : (
                  <>
                    <video
                      muted
                      playsInline
                      preload="metadata"
                      src={item.mediaUrl ?? ""}
                      className="size-full object-cover"
                    />
                    <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                      <VideoIcon className="size-3" />
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AudioRecorderComposer({
  duration,
  isFinalizing,
  isSending,
  onCancel,
  onSend,
  onStop,
  previewUrl,
  state,
}: {
  duration: number
  isFinalizing: boolean
  isSending: boolean
  onCancel: () => void
  onSend: () => void
  onStop: () => void
  previewUrl: string
  state: AudioRecorderState
}) {
  const isRecording = state === "recording"

  return (
    <div className="flex min-h-11 items-center gap-2 rounded-full bg-background px-2 py-1.5 shadow-sm ring-1 ring-border">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="shrink-0 text-destructive hover:text-destructive"
        disabled={isSending}
        onClick={onCancel}
      >
        <Trash2Icon />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {isRecording ? (
          <>
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-destructive" />
            </span>
            <span className="w-12 text-sm tabular-nums text-destructive">
              {formatAudioClock(duration)}
            </span>
            <div className="flex flex-1 items-center justify-center gap-1">
              <AudioWaveform active seed="recording" />
            </div>
            <div className="hidden items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-xs text-muted-foreground sm:flex">
              <LockIcon className="size-3" />
              <span>Gravando</span>
            </div>
          </>
        ) : (
          <WhatsAppAudioPlayer
            className="min-w-0 flex-1"
            duration={duration}
            src={previewUrl}
          />
        )}
      </div>
      {isRecording ? (
        <Button
          type="button"
          size="icon-lg"
          variant="secondary"
          disabled={isFinalizing}
          onClick={onStop}
        >
          {isFinalizing ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SquareIcon className="fill-current" />
          )}
        </Button>
      ) : (
        <Button
          type="button"
          size="icon-lg"
          disabled={isSending || !previewUrl}
          onClick={onSend}
        >
          {isSending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        </Button>
      )}
    </div>
  )
}

function WhatsAppAudioPlayer({
  className,
  duration,
  src,
}: {
  className?: string
  duration?: number
  src: string
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [loadedDuration, setLoadedDuration] = React.useState(duration ?? 0)
  const displayDuration = loadedDuration || duration || 0
  const progress = displayDuration ? currentTime / displayDuration : 0

  function togglePlayback() {
    const audio = audioRef.current

    if (!audio || !src) {
      return
    }

    if (audio.paused) {
      void audio.play()
      setIsPlaying(true)
      return
    }

    audio.pause()
    setIsPlaying(false)
  }

  return (
    <div
      className={cn(
        "flex min-w-[230px] items-center gap-3 rounded-2xl bg-background/70 px-3 py-2",
        className
      )}
    >
      <button
        type="button"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        onClick={togglePlayback}
      >
        {isPlaying ? (
          <PauseIcon className="size-4 fill-current" />
        ) : (
          <PlayIcon className="ml-0.5 size-4 fill-current" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-8 items-center gap-0.5">
          <AudioWaveform progress={progress} seed={src || "audio"} />
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>{formatAudioClock(isPlaying ? currentTime : displayDuration)}</span>
          <MicIcon className="size-3" />
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(0)
        }}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration

          if (Number.isFinite(nextDuration)) {
            setLoadedDuration(nextDuration)
          }
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
    </div>
  )
}

function AudioWaveform({
  active = false,
  progress = 0,
  seed,
}: {
  active?: boolean
  progress?: number
  seed: string
}) {
  const bars = React.useMemo(() => createWaveformBars(seed), [seed])

  return (
    <div className="flex h-8 w-full items-center gap-0.5 overflow-hidden">
      {bars.map((height, index) => {
        const isFilled = active || index / bars.length <= progress

        return (
          <span
            key={`${seed}-${index}`}
            className={cn(
              "w-0.5 shrink-0 rounded-full transition-colors",
              isFilled ? "bg-primary" : "bg-muted-foreground/35"
            )}
            style={{ height }}
          />
        )
      })}
    </div>
  )
}

function MediaImage({
  alt,
  className,
  src,
}: {
  alt: string
  className?: string
  src: string
}) {
  const [hasError, setHasError] = React.useState(false)

  if (!src || hasError) {
    return (
      <span
        className={cn(
          "flex min-h-28 items-center justify-center rounded-md bg-background/70 text-xs text-muted-foreground",
          className
        )}
      >
        <ImageIcon className="mr-2 size-4" />
        Midia indisponivel
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  )
}

function AvatarBubble({
  conversation,
  large = false,
}: {
  conversation: WhatsAppConversation
  large?: boolean
}) {
  const className = cn(
    "shrink-0 rounded-lg bg-muted bg-cover bg-center",
    large ? "size-20" : "size-10"
  )

  if (conversation.profilePicUrl) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ backgroundImage: `url(${conversation.profilePicUrl})` }}
      />
    )
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-muted font-semibold",
        large ? "size-20 text-xl" : "size-10 text-sm"
      )}
    >
      {conversation.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold">{value}</div>
    </div>
  )
}

function ContactAvatar({ contact }: { contact: EvolutionContact }) {
  if (contact.profilePicUrl) {
    return (
      <span
        aria-hidden="true"
        className="size-9 shrink-0 rounded-lg bg-muted bg-cover bg-center"
        style={{ backgroundImage: `url(${contact.profilePicUrl})` }}
      />
    )
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
      {(contact.name || contact.formattedNumber).slice(0, 1).toUpperCase()}
    </span>
  )
}

function MetricPill({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
      <Icon className="size-3.5" />
      {label}
    </span>
  )
}

function ComboboxSelect({
  className,
  onChange,
  options,
  value,
}: {
  className?: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  value: string
}) {
  const selectedOption =
    options.find((option) => option.value === value) ?? options[0] ?? null

  return (
    <Combobox
      items={options}
      value={selectedOption}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
      onValueChange={(item) => item && onChange(item.value)}
    >
      <ComboboxInput
        placeholder="Selecionar"
        className={cn("w-full bg-background", className)}
      />
      <ComboboxContent>
        <ComboboxEmpty>Nenhum item encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(item: ComboboxOption) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

async function fetchChatSnapshot({
  instanceName,
  remoteJid,
}: {
  instanceName?: string
  remoteJid?: string
}) {
  const params = new URLSearchParams()

  if (instanceName) {
    params.set("instanceName", instanceName)
  }

  if (remoteJid) {
    params.set("remoteJid", remoteJid)
  }

  const response = await fetch(
    `/api/evolution-whatsapp/chat${params.size ? `?${params}` : ""}`,
    {
      cache: "no-store",
    }
  )

  return parseApiResponse<WhatsAppChatSnapshot>(response)
}

async function fetchChatMessages({
  beforeId,
  beforeOrderKey,
  beforeTimestamp,
  instanceName,
  limit,
  remoteJid,
}: {
  beforeId?: string
  beforeOrderKey?: string
  beforeTimestamp?: string
  instanceName: string
  limit?: number
  remoteJid: string
}) {
  const params = new URLSearchParams({
    instanceName,
    mode: "messages",
    remoteJid,
  })

  if (beforeId) {
    params.set("beforeId", beforeId)
  }

  if (beforeOrderKey) {
    params.set("beforeOrderKey", beforeOrderKey)
  }

  if (beforeTimestamp) {
    params.set("beforeTimestamp", beforeTimestamp)
  }

  if (limit) {
    params.set("limit", String(limit))
  }

  const response = await fetch(`/api/evolution-whatsapp/chat?${params}`, {
    cache: "no-store",
  })

  return parseApiResponse<ChatMessagesResponse>(response)
}

async function postChatAction(input: Record<string, unknown>) {
  const response = await fetch("/api/evolution-whatsapp/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return parseApiResponse<ChatActionResponse>(response)
}

function getForwardMessageText(message: WhatsAppChatMessage) {
  const fallbackLabel = messageTypeLabel(message.type)
  const text = message.text.trim()

  if (message.mediaUrl && text === fallbackLabel) {
    return ""
  }

  return text || fallbackLabel
}

function getForwardBatchTargetLimit(messages: WhatsAppChatMessage[]) {
  return messages.some(isHighlyForwarded)
    ? HIGHLY_FORWARDED_TARGET_LIMIT
    : DEFAULT_FORWARD_TARGET_LIMIT
}

function getForwardLimitMessage(limit: number) {
  return limit === HIGHLY_FORWARDED_TARGET_LIMIT
    ? "Mensagens encaminhadas muitas vezes podem ir para apenas 1 conversa por vez."
    : "No WhatsApp, encaminhe para no maximo 5 conversas por vez."
}

function isHighlyForwarded(message?: WhatsAppChatMessage | null) {
  return (message?.forwardingScore ?? 0) >= 5
}

function getForwardedLabel(message: WhatsAppChatMessage) {
  return isHighlyForwarded(message)
    ? "Encaminhada muitas vezes"
    : "Encaminhada"
}

function canDeleteMessageForEveryone(message: WhatsAppChatMessage) {
  if (!message.fromMe || !message.timestamp) {
    return false
  }

  const sentAt = Date.parse(message.timestamp)

  if (!Number.isFinite(sentAt)) {
    return false
  }

  return Date.now() - sentAt <= DELETE_FOR_EVERYONE_WINDOW_MS
}

function canEditChatMessage(message: WhatsAppChatMessage, now = Date.now()) {
  if (
    !message.fromMe ||
    !message.timestamp ||
    message.isDeletedForEveryone ||
    message.mediaUrl
  ) {
    return false
  }

  const sentAt = Date.parse(message.timestamp)

  if (!Number.isFinite(sentAt)) {
    return false
  }

  return now - sentAt <= EDIT_MESSAGE_WINDOW_MS
}

async function createForwardMediaPayload(
  message: WhatsAppChatMessage
): Promise<WhatsAppMediaPayload | null> {
  if (!message.mediaUrl) {
    return null
  }

  const mediatype = messageTypeToMediaType(message.type)
  const response = await fetch(message.mediaUrl, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar a midia para encaminhar.")
  }

  const blob = await response.blob()

  return {
    fileName: message.fileName || fallbackFileName(mediatype),
    media: await blobToDataUrl(blob),
    mediatype,
    mimetype: message.mimetype || blob.type || defaultMimeType(mediatype),
  }
}

async function parseApiResponse<T>(response: Response) {
  const data = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null

  if (!response.ok) {
    throw new Error(
      data &&
        typeof data === "object" &&
        "message" in data &&
        typeof data.message === "string"
        ? data.message
        : "Nao foi possivel processar o chat."
    )
  }

  return data as T
}

function getRequestErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel processar o chat."
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null
  }

  if (Notification.permission !== "granted") {
    return null
  }

  try {
    return new Notification(title, {
      body,
    })
  } catch {
    return null
  }
}

function playWhatsAppNotificationSound() {
  if (typeof window === "undefined") {
    return
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext

  if (!AudioContextClass) {
    return
  }

  try {
    const audioContext = new AudioContextClass()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const now = audioContext.currentTime

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(880, now)
    oscillator.frequency.setValueAtTime(1174, now + 0.08)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.24)
    oscillator.onended = () => {
      void audioContext.close().catch(() => undefined)
    }
  } catch {
    // Browsers can block audio until the user interacts with the page.
  }
}

function createOptimisticMessage({
  id,
  instanceName,
  media,
  quoted,
  remoteJid,
  text,
  timestamp,
}: {
  id: string
  instanceName: string
  media: WhatsAppMediaPayload | null
  quoted?: WhatsAppChatMessage | null
  remoteJid: string
  text: string
  timestamp: string
}): WhatsAppChatMessage {
  const type = media ? `${media.mediatype}Message` : "conversation"

  return {
    audioSeconds: media?.audioSeconds ?? null,
    fileName: media?.fileName ?? null,
    fileSize: media?.fileSize ?? null,
    fromMe: true,
    id,
    instanceName,
    keyId: null,
    orderKey: null,
    mediaUrl: media?.media ?? null,
    mimetype: media?.mimetype ?? null,
    quoted: quoted
      ? {
          fromMe: quoted.fromMe,
          id: quoted.keyId ?? quoted.id,
          senderName: quoted.fromMe ? "Voce" : quoted.senderName,
          text: quoted.text || messageTypeLabel(quoted.type),
        }
      : null,
    remoteJid,
    senderName: "Voce",
    status: "PENDING",
    text: text.trim() || messageTypeLabel(type),
    timestamp,
    type,
  }
}

function mergeOptimisticMessages(
  messages: WhatsAppChatMessage[],
  optimisticMessages: WhatsAppChatMessage[]
) {
  const messageIds = new Set(
    messages.flatMap((message) => [message.id, message.keyId].filter(Boolean))
  )
  const usedServerMessageIds = new Set<string>()
  const pendingOptimisticMessages = sortChatMessages(optimisticMessages).filter(
    (message) => {
      if (
        messageIds.has(message.id) ||
        (message.keyId ? messageIds.has(message.keyId) : false)
      ) {
        return false
      }

      const matchingServerMessage = messages.find((serverMessage) => {
        const serverKey = serverMessage.keyId ?? serverMessage.id

        if (usedServerMessageIds.has(serverKey)) {
          return false
        }

        return isMatchingServerMessage(serverMessage, message)
      })

      if (matchingServerMessage) {
        usedServerMessageIds.add(
          matchingServerMessage.keyId ?? matchingServerMessage.id
        )
        return false
      }

      return true
    }
  )

  return sortChatMessages([...messages, ...pendingOptimisticMessages])
}

function mergeFreshMessagesWithCached(
  cachedMessages: WhatsAppChatMessage[],
  freshMessages: WhatsAppChatMessage[]
) {
  if (!cachedMessages.length) {
    return sortChatMessages(freshMessages)
  }

  if (!freshMessages.length) {
    return sortChatMessages(cachedMessages)
  }

  return mergeMessagePages(cachedMessages, freshMessages)
}

function mergeMessagePages(
  currentMessages: WhatsAppChatMessage[],
  incomingMessages: WhatsAppChatMessage[]
) {
  const mergedById = new Map<string, WhatsAppChatMessage>()

  for (const chatMessage of currentMessages) {
    mergedById.set(getStableMessageIdentity(chatMessage), chatMessage)
  }

  for (const chatMessage of incomingMessages) {
    mergedById.set(getStableMessageIdentity(chatMessage), chatMessage)
  }

  return sortChatMessages([...mergedById.values()])
}

function getOldestServerMessage(messages: WhatsAppChatMessage[]) {
  return sortChatMessages(messages).find(
    (chatMessage) =>
      !chatMessage.id.startsWith("temp-") && Boolean(chatMessage.timestamp)
  )
}

function getStableMessageIdentity(message: WhatsAppChatMessage) {
  return `${message.instanceName}:${message.remoteJid}:${
    message.keyId ?? message.id
  }`
}

function removeMatchedOptimisticMessages(
  optimisticMessages: WhatsAppChatMessage[],
  instanceName: string,
  remoteJid: string,
  serverMessages: WhatsAppChatMessage[]
) {
  const usedServerMessageIds = new Set<string>()

  return sortChatMessages(optimisticMessages).filter((optimisticMessage) => {
    if (
      optimisticMessage.instanceName !== instanceName ||
      optimisticMessage.remoteJid !== remoteJid
    ) {
      return true
    }

    const matchingServerMessage = serverMessages.find((serverMessage) => {
      const serverKey = serverMessage.keyId ?? serverMessage.id

      if (usedServerMessageIds.has(serverKey)) {
        return false
      }

      return isMatchingServerMessage(serverMessage, optimisticMessage)
    })

    if (!matchingServerMessage) {
      return true
    }

    usedServerMessageIds.add(
      matchingServerMessage.keyId ?? matchingServerMessage.id
    )
    return false
  })
}

function hasMatchingServerMessage(
  serverMessages: WhatsAppChatMessage[],
  optimisticMessage: WhatsAppChatMessage
) {
  return serverMessages.some((serverMessage) =>
    isMatchingServerMessage(serverMessage, optimisticMessage)
  )
}

function isMatchingServerMessage(
  serverMessage: WhatsAppChatMessage,
  optimisticMessage: WhatsAppChatMessage
) {
  if (
    !serverMessage.fromMe ||
    !optimisticMessage.fromMe ||
    serverMessage.id.startsWith("temp-") ||
    serverMessage.instanceName !== optimisticMessage.instanceName ||
    serverMessage.remoteJid !== optimisticMessage.remoteJid ||
    normalizeMessageType(serverMessage.type) !==
      normalizeMessageType(optimisticMessage.type)
  ) {
    return false
  }

  const optimisticTime = Date.parse(optimisticMessage.timestamp ?? "")
  const serverTime = Date.parse(serverMessage.timestamp ?? "")

  if (Number.isFinite(optimisticTime) && Number.isFinite(serverTime)) {
    const diff = serverTime - optimisticTime

    if (diff < -10_000 || diff > 10 * 60 * 1000) {
      return false
    }
  }

  if (optimisticMessage.fileName && serverMessage.fileName) {
    return (
      normalizeText(optimisticMessage.fileName ?? "") ===
      normalizeText(serverMessage.fileName ?? "")
    )
  }

  return (
    normalizeMessageTextForMatch(optimisticMessage.text) ===
    normalizeMessageTextForMatch(serverMessage.text)
  )
}

function normalizeMessageType(type?: string | null) {
  return String(type ?? "").toLowerCase()
}

function normalizeMessageTextForMatch(value?: string | null) {
  return String(value ?? "").trim().replace(/\s+/g, " ")
}

function sortChatMessages(messages: WhatsAppChatMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = Date.parse(left.timestamp ?? "")
    const rightTime = Date.parse(right.timestamp ?? "")

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      const diff = leftTime - rightTime

      if (diff !== 0) {
        return diff
      }
    }

    const orderDiff = compareMessageOrderKey(left.orderKey, right.orderKey)

    if (orderDiff !== 0) {
      return orderDiff
    }

    return left.id.localeCompare(right.id)
  })
}

function compareMessageOrderKey(left?: string | null, right?: string | null) {
  const leftParts = parsePostgresTupleId(left)
  const rightParts = parsePostgresTupleId(right)

  if (!leftParts || !rightParts) {
    return 0
  }

  const blockDiff = leftParts.block - rightParts.block

  if (blockDiff !== 0) {
    return blockDiff
  }

  return leftParts.offset - rightParts.offset
}

function parsePostgresTupleId(value?: string | null) {
  const match = String(value ?? "").match(/^\((\d+),(\d+)\)$/)

  if (!match) {
    return null
  }

  return {
    block: Number(match[1]),
    offset: Number(match[2]),
  }
}

function isSameWhatsAppMessage(
  left: WhatsAppChatMessage,
  right: WhatsAppChatMessage
) {
  if (
    left.instanceName !== right.instanceName ||
    left.remoteJid !== right.remoteJid
  ) {
    return false
  }

  if (left.id === right.id) {
    return true
  }

  return Boolean(left.keyId && right.keyId && left.keyId === right.keyId)
}

function getDirectMessageSenderName(
  message: WhatsAppChatMessage,
  conversation: WhatsAppConversation
) {
  if (message.fromMe) {
    return "Voce"
  }

  return message.senderName || conversation.name
}

function getQuotedMessageSenderName(
  message: WhatsAppChatMessage,
  conversation: WhatsAppConversation
) {
  const quoted = message.quoted

  if (!quoted) {
    return ""
  }

  if (quoted.senderName && !quoted.senderName.includes("@")) {
    return formatParticipantName(quoted.senderName)
  }

  if (quoted.fromMe) {
    return "Voce"
  }

  if (quoted.fromMe === false) {
    return conversation.name
  }

  return message.fromMe ? conversation.name : "Voce"
}

function formatParticipantName(value: string) {
  if (!value.includes("@")) {
    return value
  }

  const number = getRemoteJidNumber(value)

  return number ? formatPhoneNumber(number) : value
}

function getConversationKey(conversation?: WhatsAppConversation | null) {
  return conversation
    ? makeConversationKey(conversation.instanceName, conversation.remoteJid)
    : ""
}

function markSnapshotConversationRead(
  snapshot: WhatsAppChatSnapshot,
  conversationKey: string
) {
  let changed = false
  const conversations = snapshot.conversations.map((conversation) => {
    if (
      getConversationKey(conversation) !== conversationKey ||
      conversation.unreadMessages === 0
    ) {
      return conversation
    }

    changed = true

    return {
      ...conversation,
      unreadMessages: 0,
    }
  })

  if (!changed) {
    return snapshot
  }

  return {
    ...snapshot,
    conversations: sortConversationsByActivity(conversations),
    totals: {
      ...snapshot.totals,
      unread: conversations.reduce(
        (sum, conversation) => sum + conversation.unreadMessages,
        0
      ),
    },
  }
}

function mergeSnapshotConversationPreviews(
  previous: WhatsAppChatSnapshot,
  next: WhatsAppChatSnapshot
) {
  const previousByKey = new Map(
    previous.conversations.map((conversation) => [
      getConversationKey(conversation),
      conversation,
    ])
  )
  const nextConversationKeys = new Set(
    next.conversations.map((conversation) => getConversationKey(conversation))
  )
  const activeInstanceNames = new Set(
    next.instances.map((instance) => instance.instanceName)
  )
  const conversations = next.conversations.map((conversation) =>
    mergeConversationPreview(
      previousByKey.get(getConversationKey(conversation)),
      conversation
    )
  )
  const preservedConversations = previous.conversations.filter(
    (conversation) =>
      activeInstanceNames.has(conversation.instanceName) &&
      !nextConversationKeys.has(getConversationKey(conversation))
  )
  const mergedConversations = sortConversationsByActivity([
    ...conversations,
    ...preservedConversations,
  ])

  return {
    ...next,
    conversations: mergedConversations,
    totals: getSnapshotTotals(mergedConversations, next.instances.length),
  }
}

function mergeConversationPreview(
  previous: WhatsAppConversation | undefined,
  next: WhatsAppConversation
) {
  if (!previous) {
    return next
  }

  const previousTime = getConversationLastMessageTime(previous)
  const nextTime = getConversationLastMessageTime(next)
  const nextHasIncomingUnread =
    next.unreadMessages > 0 &&
    !next.lastMessageFromMe &&
    Boolean(next.lastMessageText)

  if (nextHasIncomingUnread) {
    return next
  }

  if (
    Number.isFinite(previousTime) &&
    (!Number.isFinite(nextTime) || previousTime > nextTime)
  ) {
    return {
      ...next,
      lastMessageAt: previous.lastMessageAt,
      lastMessageFromMe: previous.lastMessageFromMe,
      lastMessageStatus: previous.lastMessageStatus,
      lastMessageText: previous.lastMessageText,
      lastMessageType: previous.lastMessageType,
      updatedAt: previous.updatedAt ?? next.updatedAt,
    }
  }

  return next
}

function getSnapshotTotals(
  conversations: WhatsAppConversation[],
  instances: number
): WhatsAppChatSnapshot["totals"] {
  return {
    contacts: conversations.filter(
      (conversation) => conversation.kind === "contact"
    ).length,
    conversations: conversations.length,
    groups: conversations.filter((conversation) => conversation.kind === "group")
      .length,
    instances,
    unread: conversations.reduce(
      (sum, conversation) => sum + conversation.unreadMessages,
      0
    ),
  }
}

function updateSnapshotConversationFromMessages(
  snapshot: WhatsAppChatSnapshot,
  conversationKey: string,
  messages: WhatsAppChatMessage[]
) {
  const lastMessage = [...messages]
    .reverse()
    .find((message) => isListPreviewMessage(message))

  if (!lastMessage) {
    return snapshot
  }

  let changed = false
  const conversations = snapshot.conversations.map((conversation) => {
    if (getConversationKey(conversation) !== conversationKey) {
      return conversation
    }

    const nextPreviewTime = Date.parse(lastMessage.timestamp ?? "")
    const currentPreviewTime = getConversationLastMessageTime(conversation)

    if (
      Number.isFinite(nextPreviewTime) &&
      Number.isFinite(currentPreviewTime) &&
      nextPreviewTime < currentPreviewTime
    ) {
      return conversation
    }

    changed = true

    return {
      ...conversation,
      lastMessageAt: lastMessage.timestamp ?? conversation.lastMessageAt,
      lastMessageFromMe: lastMessage.fromMe,
      lastMessageStatus: lastMessage.status ?? conversation.lastMessageStatus,
      lastMessageText:
        lastMessage.text || messageTypeLabel(lastMessage.type) || conversation.lastMessageText,
      lastMessageType: lastMessage.type,
      unreadMessages: 0,
      updatedAt: lastMessage.timestamp ?? conversation.updatedAt,
    }
  })

  if (!changed) {
    return snapshot
  }

  return {
    ...snapshot,
    conversations: sortConversationsByActivity(conversations),
    totals: {
      ...snapshot.totals,
      unread: conversations.reduce(
        (sum, conversation) => sum + conversation.unreadMessages,
        0
      ),
    },
  }
}

function sortConversationsByActivity(conversations: WhatsAppConversation[]) {
  return [...conversations].sort((left, right) => {
    const leftTime = getConversationActivityTime(left)
    const rightTime = getConversationActivityTime(right)

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      const diff = rightTime - leftTime

      if (diff !== 0) {
        return diff
      }
    }

    if (Number.isFinite(rightTime)) {
      return 1
    }

    if (Number.isFinite(leftTime)) {
      return -1
    }

    return left.name.localeCompare(right.name)
  })
}

function getConversationActivityTime(conversation: WhatsAppConversation) {
  const timestamps = [
    Date.parse(conversation.lastMessageAt ?? ""),
    Date.parse(conversation.updatedAt ?? ""),
  ].filter((value) => Number.isFinite(value))

  return timestamps.length ? Math.max(...timestamps) : Number.NaN
}

function getConversationLastMessageTime(conversation: WhatsAppConversation) {
  const lastMessageTime = Date.parse(conversation.lastMessageAt ?? "")

  if (Number.isFinite(lastMessageTime)) {
    return lastMessageTime
  }

  const updatedAt = Date.parse(conversation.updatedAt ?? "")

  return Number.isFinite(updatedAt) ? updatedAt : Number.NaN
}

function isListPreviewMessage(message: WhatsAppChatMessage) {
  const type = message.type.toLowerCase()

  return (
    !message.isEditProtocol &&
    !message.deletedTargetKeyId &&
    !type.includes("reaction") &&
    !type.includes("protocol")
  )
}

function makeConversationKey(instanceName: string, remoteJid: string) {
  return `${instanceName}::${remoteJid}`
}

function getRemoteJidFromInput(value: string) {
  const trimmed = value.trim()

  if (trimmed.includes("@")) {
    return trimmed
  }

  const digits = normalizePhoneDigits(trimmed)

  return digits.length >= 10 ? `${digits}@s.whatsapp.net` : ""
}

function normalizePhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "")

  if (!digits) {
    return ""
  }

  if (value.trim().startsWith("+") || digits.startsWith("55") || digits.length > 11) {
    return digits
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  return digits
}

function getRemoteJidNumber(remoteJid: string) {
  return remoteJid.split("@")[0]?.replace(/\D/g, "") ?? ""
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "")

  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`
  }

  return digits ? `+${digits}` : value
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function formatShortTime(value?: string | null) {
  if (!value) {
    return ""
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatConversationTime(value?: string | null) {
  if (!value) {
    return ""
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatShortDate(value?: string | null) {
  if (!value) {
    return ""
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

function formatPinnedExpiration(value?: string | null) {
  if (!value) {
    return ""
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const today = new Date()
  const tomorrow = new Date()

  tomorrow.setDate(today.getDate() + 1)

  if (date.toDateString() === today.toDateString()) {
    return `hoje ${formatShortTime(value)}`
  }

  if (date.toDateString() === tomorrow.toDateString()) {
    return `amanha ${formatShortTime(value)}`
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date)
}

function isDateExpired(value?: string | null) {
  if (!value) {
    return false
  }

  const date = new Date(value)

  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now()
}

function groupMessagesByMonth(messages: WhatsAppChatMessage[]) {
  const groups = new Map<string, WhatsAppChatMessage[]>()

  for (const message of messages) {
    const date = message.timestamp ? new Date(message.timestamp) : new Date()
    const label = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
    })
      .format(date)
      .toUpperCase()

    groups.set(label, [...(groups.get(label) ?? []), message])
  }

  return [...groups.entries()].map(([label, items]) => ({
    items,
    label,
  }))
}

function formatFileSize(value?: string | null) {
  const bytes = Number(value)

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return ""
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getFileExtension(fileName?: string | null) {
  const extension = fileName?.split(".").pop()

  return extension ? extension.toUpperCase() : ""
}

function extractUrls(value: string) {
  return value.match(/https?:\/\/\S+/gi) ?? []
}

function getUrlHost(value: string) {
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

function formatMessageDate(value?: string | null) {
  if (!value) {
    return "Mensagens"
  }

  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()

  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return "Hoje"
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Ontem"
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date)
}

function shouldShowDateSeparator(
  messages: WhatsAppChatMessage[],
  index: number
) {
  const current = messages[index]?.timestamp
  const previous = messages[index - 1]?.timestamp

  if (!current) {
    return index === 0
  }

  if (!previous) {
    return true
  }

  return new Date(current).toDateString() !== new Date(previous).toDateString()
}

function messageTypeLabel(type: string) {
  if (type.includes("image")) {
    return "Imagem"
  }

  if (type.includes("video")) {
    return "Video"
  }

  if (type.includes("audio")) {
    return "Audio"
  }

  if (type.includes("document")) {
    return "Documento"
  }

  if (type.includes("sticker")) {
    return "Figurinha"
  }

  return "Mensagem"
}

function messageTypeToMediaType(type: string) {
  if (type.includes("image")) {
    return "image"
  }

  if (type.includes("video")) {
    return "video"
  }

  if (type.includes("audio")) {
    return "audio"
  }

  return "document"
}

function isVisualMediaMessage(message: WhatsAppChatMessage) {
  const mediaType = messageTypeToMediaType(message.type)

  return Boolean(
    message.mediaUrl && (mediaType === "image" || mediaType === "video")
  )
}

function getMessageMediaKey(message: WhatsAppChatMessage) {
  return message.keyId ?? message.id
}

function getMessageSelectionKey(message: WhatsAppChatMessage) {
  return message.keyId ?? message.id
}

function getMediaCaption(message: WhatsAppChatMessage) {
  const text = message.text.trim()

  if (!text || normalizeText(text) === normalizeText(messageTypeLabel(message.type))) {
    return ""
  }

  return text
}

function formatMediaViewerTimestamp(value?: string | null) {
  if (!value) {
    return ""
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const today = new Date()
  const yesterday = new Date()

  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return `Hoje as ${formatShortTime(value)}`
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return `Ontem as ${formatShortTime(value)}`
  }

  return `${formatShortDate(value)} as ${formatShortTime(value)}`
}

function MediaIcon({
  mediatype,
}: {
  mediatype: WhatsAppMediaPayload["mediatype"]
}) {
  if (mediatype === "image") {
    return <ImageIcon className="size-4" />
  }

  if (mediatype === "video") {
    return <VideoIcon className="size-4" />
  }

  if (mediatype === "audio") {
    return <MicIcon className="size-4" />
  }

  return <FileIcon className="size-4" />
}

function fallbackFileName(type: WhatsAppMediaPayload["mediatype"]) {
  if (type === "image") {
    return "imagem.jpg"
  }

  if (type === "video") {
    return "video.mp4"
  }

  if (type === "audio") {
    return "audio.webm"
  }

  return "documento.pdf"
}

function getUploadMediaType(file: File): WhatsAppMediaPayload["mediatype"] {
  const fileName = file.name.toLowerCase()

  if (
    file.type.startsWith("image/") ||
    /\.(apng|avif|gif|jpe?g|png|webp)$/i.test(fileName)
  ) {
    return "image"
  }

  if (
    file.type.startsWith("video/") ||
    /\.(3gp|avi|m4v|mkv|mov|mp4|mpeg|webm)$/i.test(fileName)
  ) {
    return "video"
  }

  if (
    file.type.startsWith("audio/") ||
    /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|weba|webm)$/i.test(fileName)
  ) {
    return "audio"
  }

  return "document"
}

function defaultMimeType(type: WhatsAppMediaPayload["mediatype"]) {
  if (type === "image") {
    return "image/jpeg"
  }

  if (type === "video") {
    return "video/mp4"
  }

  if (type === "audio") {
    return "audio/webm"
  }

  return "application/pdf"
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return ""
  }

  return (
    [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
  )
}

function formatAudioClock(value: number) {
  const totalSeconds = Math.max(0, Math.floor(value))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function createWaveformBars(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return Array.from({ length: 42 }, (_, index) => {
    hash = (hash * 1664525 + 1013904223 + index) >>> 0
    const normalized = hash / 0xffffffff

    return 8 + Math.round(normalized * 22)
  })
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")))
    reader.addEventListener("error", () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")))
    reader.addEventListener("error", () => reject(reader.error))
    reader.readAsDataURL(blob)
  })
}
