"use client"

import * as React from "react"
import {
  CheckIcon,
  CheckCheckIcon,
  CopyIcon,
  Edit3Icon,
  FileIcon,
  ImageIcon,
  InfoIcon,
  Loader2Icon,
  MessageCircleIcon,
  MicIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshCwIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  SmileIcon,
  SmartphoneIcon,
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
  type WhatsAppGroup,
  type WhatsAppGroupsSnapshot,
  type WhatsAppMediaPayload,
} from "@/lib/evolution-whatsapp-chat-types"

type GroupsActionResponse = {
  snapshot: WhatsAppGroupsSnapshot
}

type ChatActionResponse = {
  snapshot: WhatsAppChatSnapshot
}

type ComboboxOption = {
  label: string
  value: string
}

type ModalState = "create" | "edit" | null

const ALL_VALUE = "all"
const POLLING_INTERVAL_MS = 2500

export function WhatsAppGroupsPanel() {
  const [snapshot, setSnapshot] = React.useState<WhatsAppGroupsSnapshot | null>(
    null
  )
  const [selectedGroupId, setSelectedGroupId] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [instanceFilter, setInstanceFilter] = React.useState(ALL_VALUE)
  const [participantQuery, setParticipantQuery] = React.useState("")
  const [groupMessages, setGroupMessages] = React.useState<WhatsAppChatMessage[]>(
    []
  )
  const [optimisticMessages, setOptimisticMessages] = React.useState<
    WhatsAppChatMessage[]
  >([])
  const [chatSearch, setChatSearch] = React.useState("")
  const [isChatSearchOpen, setIsChatSearchOpen] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [media, setMedia] = React.useState<WhatsAppMediaPayload | null>(null)
  const [replyTo, setReplyTo] = React.useState<WhatsAppChatMessage | null>(null)
  const [modal, setModal] = React.useState<ModalState>(null)
  const [groupDraft, setGroupDraft] = React.useState({
    description: "",
    instanceName: "",
    participants: [] as string[],
    subject: "",
  })
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [isBusy, setIsBusy] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)

  const selectedGroup = React.useMemo(() => {
    if (!snapshot) {
      return null
    }

    return (
      snapshot.groups.find((group) => group.id === selectedGroupId) ??
      snapshot.groups[0] ??
      null
    )
  }, [selectedGroupId, snapshot])
  const selectedGroupInstanceName = selectedGroup?.instanceName ?? ""
  const selectedGroupRemoteJid = selectedGroup?.id ?? ""

  const fetchSnapshot = React.useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setIsSyncing(true)
    }

    try {
      const next = await fetchGroupsSnapshot()

      setSnapshot(next)
      setSelectedGroupId((current) =>
        next.groups.some((group) => group.id === current)
          ? current
          : next.groups[0]?.id ?? ""
      )
      setGroupDraft((current) => ({
        ...current,
        instanceName: current.instanceName || next.instances[0]?.instanceName || "",
      }))

      return next
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
      return null
    } finally {
      setIsLoading(false)
      setIsSyncing(false)
    }
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSnapshot()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [fetchSnapshot])

  const fetchSelectedGroupMessages = React.useCallback(
    async (
      group: Pick<WhatsAppGroup, "id" | "instanceName"> | null,
      options: { silent?: boolean } = {}
    ) => {
      if (!group) {
        setGroupMessages([])
        return
      }

      try {
        const next = await fetchChatSnapshot({
          instanceName: group.instanceName,
          remoteJid: group.id,
        })

        setGroupMessages(next.selected?.messages ?? [])
      } catch (error) {
        if (!options.silent) {
          toast.error(getRequestErrorMessage(error))
        }
      }
    },
    []
  )

  React.useEffect(() => {
    if (!selectedGroupInstanceName || !selectedGroupRemoteJid) {
      return
    }

    const timer = window.setTimeout(() => {
      void fetchSelectedGroupMessages({
        id: selectedGroupRemoteJid,
        instanceName: selectedGroupInstanceName,
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [
    fetchSelectedGroupMessages,
    selectedGroupInstanceName,
    selectedGroupRemoteJid,
  ])

  React.useEffect(() => {
    if (!selectedGroupInstanceName || !selectedGroupRemoteJid) {
      return
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return
      }

      void fetchSelectedGroupMessages(
        {
          id: selectedGroupRemoteJid,
          instanceName: selectedGroupInstanceName,
        },
        { silent: true }
      )
    }, POLLING_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [
    fetchSelectedGroupMessages,
    selectedGroupInstanceName,
    selectedGroupRemoteJid,
  ])

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [groupMessages.length, optimisticMessages.length, selectedGroup?.id])

  const filteredGroups = React.useMemo(() => {
    if (!snapshot) {
      return []
    }

    const normalizedQuery = normalizeText(query)

    return snapshot.groups.filter((group) => {
      const matchesQuery =
        !normalizedQuery ||
        normalizeText(group.subject).includes(normalizedQuery) ||
        normalizeText(group.description ?? "").includes(normalizedQuery) ||
        group.id.includes(normalizedQuery)
      const matchesInstance =
        instanceFilter === ALL_VALUE || group.instanceName === instanceFilter

      return matchesQuery && matchesInstance
    })
  }, [instanceFilter, query, snapshot])

  const availableContacts = React.useMemo(() => {
    if (!snapshot) {
      return []
    }
    const existingNumbers = new Set(
      modal === "edit"
        ? selectedGroup?.participants.map((participant) => participant.number) ?? []
        : []
    )

    return snapshot.contacts.filter(
      (contact) =>
        contact.instanceName === groupDraft.instanceName &&
        !existingNumbers.has(contact.number)
    )
  }, [groupDraft.instanceName, modal, selectedGroup?.participants, snapshot])

  const filteredParticipants = React.useMemo(() => {
    if (!selectedGroup) {
      return []
    }

    const normalizedQuery = normalizeText(participantQuery)
    const numberQuery = participantQuery.replace(/\D/g, "")

    return selectedGroup.participants.filter((participant) => {
      if (!normalizedQuery && !numberQuery) {
        return true
      }

      return (
        normalizeText(participant.name).includes(normalizedQuery) ||
        participant.number.includes(numberQuery)
      )
    })
  }, [participantQuery, selectedGroup])

  const visibleMessages = React.useMemo(() => {
    const selectedGroupMessages = selectedGroup
      ? mergeOptimisticMessages(
          groupMessages,
          optimisticMessages.filter(
            (chatMessage) =>
              chatMessage.instanceName === selectedGroup.instanceName &&
              chatMessage.remoteJid === selectedGroup.id
          )
        )
      : groupMessages
    const normalizedQuery = normalizeText(chatSearch)

    if (!normalizedQuery) {
      return selectedGroupMessages
    }

    return selectedGroupMessages.filter((chatMessage) =>
      normalizeText(chatMessage.text).includes(normalizedQuery)
    )
  }, [chatSearch, groupMessages, optimisticMessages, selectedGroup])

  function openCreateModal() {
    setGroupDraft({
      description: "",
      instanceName: snapshot?.instances[0]?.instanceName ?? "",
      participants: [],
      subject: "",
    })
    setModal("create")
  }

  function openEditModal(group: WhatsAppGroup) {
    setGroupDraft({
      description: group.description ?? "",
      instanceName: group.instanceName,
      participants: [],
      subject: group.subject,
    })
    setModal("edit")
  }

  async function handleSubmitGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsBusy(true)

    try {
      const result =
        modal === "create"
          ? await postGroupsAction({
              action: "create",
              description: groupDraft.description,
              instanceName: groupDraft.instanceName,
              participants: groupDraft.participants,
              subject: groupDraft.subject,
            })
          : await postGroupsAction({
              action: "update-details",
              description: groupDraft.description,
              groupJid: selectedGroup?.id,
              instanceName: selectedGroup?.instanceName,
              participants: groupDraft.participants,
              subject: groupDraft.subject,
            })

      setSnapshot(result.snapshot)
      setModal(null)
      toast.success(modal === "create" ? "Grupo criado." : "Grupo atualizado.")
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSendGroupMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedGroup) {
      toast.warning("Selecione um grupo.")
      return
    }

    if (!message.trim() && !media) {
      toast.warning("Digite uma mensagem ou selecione um arquivo.")
      return
    }

    const currentText = message
    const currentMedia = media
    const optimisticMessage = createOptimisticMessage({
      instanceName: selectedGroup.instanceName,
      media: currentMedia,
      remoteJid: selectedGroup.id,
      text: currentText,
    })

    setMessage("")
    setMedia(null)
    setOptimisticMessages((current) => [...current, optimisticMessage])
    setIsBusy(true)

    try {
      const result = currentMedia
        ? await postChatAction({
            action: "send-media",
            caption: currentText,
            instanceName: selectedGroup.instanceName,
            media: currentMedia,
            quoted: replyTo,
            remoteJid: selectedGroup.id,
          })
        : await postChatAction({
            action: "send-text",
            instanceName: selectedGroup.instanceName,
            quoted: replyTo,
            remoteJid: selectedGroup.id,
            text: currentText,
          })

      setGroupMessages(result.snapshot.selected?.messages ?? [])
      setOptimisticMessages((current) =>
        current.filter((chatMessage) => chatMessage.id !== optimisticMessage.id)
      )
      setReplyTo(null)
      toast.success("Mensagem enviada para o grupo.")
    } catch (error) {
      setOptimisticMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.id === optimisticMessage.id
            ? { ...chatMessage, status: "ERROR" }
            : chatMessage
        )
      )
      toast.error(getRequestErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) {
      return
    }

    const dataUrl = await fileToDataUrl(file)
    const mediatype = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : "document"

    setMedia({
      fileName: file.name || fallbackFileName(mediatype),
      media: dataUrl,
      mediatype,
      mimetype: file.type || defaultMimeType(mediatype),
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
    if (!selectedGroup) {
      return
    }

    try {
      await postChatAction({
        action: "send-reaction",
        instanceName: selectedGroup.instanceName,
        message: chatMessage,
        reaction,
      })
      toast.success("Reacao enviada.")
      await fetchSelectedGroupMessages(selectedGroup, { silent: true })
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    }
  }

  async function handleDeleteMessage(chatMessage: WhatsAppChatMessage) {
    if (!selectedGroup) {
      return
    }

    if (!window.confirm("Apagar esta mensagem para todos?")) {
      return
    }

    try {
      await postChatAction({
        action: "delete-message",
        instanceName: selectedGroup.instanceName,
        message: chatMessage,
      })
      setGroupMessages((current) =>
        current.filter((messageItem) => messageItem.id !== chatMessage.id)
      )
      toast.success("Mensagem apagada.")
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    }
  }

  async function handleParticipantAction({
    action,
    number,
  }: {
    action: "demote" | "promote" | "remove"
    number: string
  }) {
    if (!selectedGroup) {
      return
    }

    if (
      action === "remove" &&
      !window.confirm("Remover este participante do grupo?")
    ) {
      return
    }

    setIsBusy(true)

    try {
      const result = await postGroupsAction({
        action: "update-participants",
        groupJid: selectedGroup.id,
        instanceName: selectedGroup.instanceName,
        participantAction: action,
        participants: [number],
      })

      setSnapshot(result.snapshot)
      toast.success("Participante atualizado.")
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  if (isLoading && !snapshot) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Carregando grupos...
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

  return (
    <section className="grid h-full min-h-0 overflow-hidden rounded-lg border border-border/70 bg-background lg:grid-cols-[360px_minmax(0,1fr)_320px]">
      <aside className="flex min-h-0 flex-col overflow-hidden border-b border-border/80 bg-card/30 lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-border/80 p-3">
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 gap-2 text-[11px] text-muted-foreground">
              <MetricPill icon={UsersIcon} label={`${snapshot.totals.groups}`} />
              <MetricPill
                icon={MessageCircleIcon}
                label={`${snapshot.totals.participants}`}
              />
              <MetricPill
                icon={SmartphoneIcon}
                label={`${snapshot.totals.instances}`}
              />
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <ComboboxSelect
                value={instanceFilter}
                options={[
                  { label: "Todos os WhatsApps", value: ALL_VALUE },
                  ...snapshot.instances.map((instance) => ({
                    label: instance.displayName,
                    value: instance.instanceName,
                  })),
                ]}
                className="h-8 w-[172px]"
                onChange={setInstanceFilter}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={isSyncing}
                onClick={() => void fetchSnapshot()}
              >
                {isSyncing ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <RefreshCwIcon />
                )}
              </Button>
              <Button type="button" size="icon-sm" onClick={openCreateModal}>
                <PlusIcon />
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="relative min-w-0">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                placeholder="Pesquisar grupo"
                className="h-9 rounded-lg bg-background pl-9"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredGroups.length ? (
            <div className="divide-y divide-border/70">
              {filteredGroups.map((group) => (
                <button
                  key={`${group.instanceName}-${group.id}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40",
                    selectedGroup?.id === group.id &&
                      selectedGroup.instanceName === group.instanceName &&
                      "bg-muted/70"
                  )}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <UsersIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {group.subject}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {group.size || group.participants.length} participantes
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Nenhum grupo encontrado.
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col overflow-hidden">
          {selectedGroup ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-border/80 bg-card/50 px-4 py-3">
                <GroupAvatar group={selectedGroup} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {selectedGroup.subject}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {selectedGroup.size || selectedGroup.participants.length} participantes - {selectedGroup.instanceDisplayName}
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
                <Button type="button" size="icon-sm" variant="ghost">
                  <InfoIcon />
                </Button>
              </div>

              {isChatSearchOpen ? (
                <div className="shrink-0 border-b border-border/80 bg-background p-2">
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={chatSearch}
                      placeholder="Pesquisar neste grupo"
                      className="h-9 pl-9"
                      onChange={(event) => setChatSearch(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,var(--muted)_1px,transparent_0)] bg-[length:22px_22px] px-4 py-4">
                <div className="mx-auto flex max-w-3xl flex-col gap-2">
                  {visibleMessages.length ? (
                    visibleMessages.map((chatMessage, index) => (
                      <React.Fragment key={chatMessage.id}>
                        {shouldShowDateSeparator(visibleMessages, index) ? (
                          <DateSeparator value={chatMessage.timestamp} />
                        ) : null}
                        <MessageBubble
                          message={chatMessage}
                          onCopy={() => void handleCopyMessage(chatMessage)}
                          onDelete={() => void handleDeleteMessage(chatMessage)}
                          onReact={(reaction) =>
                            void handleReactMessage(chatMessage, reaction)
                          }
                          onReply={() => setReplyTo(chatMessage)}
                        />
                      </React.Fragment>
                    ))
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-background/70 p-6 text-center text-sm text-muted-foreground">
                      Nenhuma mensagem sincronizada neste grupo.
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <form
                className="shrink-0 border-t border-border/80 bg-card/50 p-3"
                onSubmit={(event) => void handleSendGroupMessage(event)}
              >
                {replyTo ? (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-primary">
                        Respondendo {replyTo.fromMe ? "voce" : replyTo.senderName}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {replyTo.text || messageTypeLabel(replyTo.type)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setReplyTo(null)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ) : null}
                {media ? (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <MediaIcon mediatype={media.mediatype} />
                      <span className="truncate">
                        {media.mediatype === "image"
                          ? "Imagem selecionada"
                          : media.mediatype === "video"
                            ? "Video selecionado"
                            : "Documento selecionado"}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setMedia(null)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <Button type="button" size="icon-lg" variant="ghost">
                    <SmileIcon />
                  </Button>
                  <label className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-muted">
                    <PaperclipIcon className="size-4" />
                    <input
                      type="file"
                      className="sr-only"
                      disabled={isBusy}
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf"
                      onChange={(event) => {
                        void handleUpload(event.target.files?.[0] ?? null)
                        event.currentTarget.value = ""
                      }}
                    />
                  </label>
                  <Textarea
                    value={message}
                    rows={1}
                    disabled={isBusy}
                    placeholder={media ? "Legenda opcional" : "Mensagem"}
                    className="max-h-32 min-h-9 resize-none rounded-lg bg-background"
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault()
                        event.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                  <Button type="submit" size="icon-lg" disabled={isBusy}>
                    {isBusy ? (
                      <Loader2Icon className="animate-spin" />
                    ) : message.trim() || media ? (
                      <SendIcon />
                    ) : (
                      <MicIcon />
                    )}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Selecione um grupo.
            </div>
          )}
      </div>

      <aside className="hidden min-h-0 flex-col overflow-hidden border-l border-border/80 bg-card/30 lg:flex">
        {selectedGroup ? (
          <>
            <div className="border-b border-border/80 p-4 text-center">
              <div className="mx-auto">
                <GroupAvatar group={selectedGroup} large />
              </div>
              <div className="mt-3 text-sm font-semibold">
                {selectedGroup.subject}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedGroup.size || selectedGroup.participants.length} participantes
              </div>
              <Button
                type="button"
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => openEditModal(selectedGroup)}
              >
                <Edit3Icon />
                Editar grupo
              </Button>
            </div>
            <div className="grid gap-2 border-b border-border/80 p-3">
              <InfoCard
                label="Descricao"
                value={selectedGroup.description || "Sem descricao"}
              />
              <InfoCard
                label="Envio"
                value={selectedGroup.announce ? "Admins" : "Todos"}
              />
              <InfoCard
                label="Edicao"
                value={selectedGroup.restrict ? "Restrita" : "Livre"}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <Label>Participantes</Label>
              <div className="relative mt-2">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={participantQuery}
                  placeholder="Pesquisar participante"
                  className="h-9 pl-9"
                  onChange={(event) => setParticipantQuery(event.target.value)}
                />
              </div>
              <div className="mt-2 max-h-[calc(100%-72px)] overflow-y-auto rounded-lg border border-border">
                {filteredParticipants.length ? (
                  filteredParticipants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 border-b border-border/70 px-3 py-2 last:border-b-0"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                        {participant.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {participant.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatPhoneNumber(participant.number)}
                        </span>
                      </span>
                      {participant.isAdmin || participant.isSuperAdmin ? (
                        <span className="rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                          Admin
                        </span>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                            />
                          }
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {participant.isAdmin || participant.isSuperAdmin ? (
                            <DropdownMenuItem
                              onClick={() =>
                                void handleParticipantAction({
                                  action: "demote",
                                  number: participant.number,
                                })
                              }
                            >
                              Rebaixar admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                void handleParticipantAction({
                                  action: "promote",
                                  number: participant.number,
                                })
                              }
                            >
                              Tornar admin
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              void handleParticipantAction({
                                action: "remove",
                                number: participant.number,
                              })
                            }
                          >
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Nenhum participante encontrado.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </aside>

      <Dialog open={modal !== null} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {modal === "create" ? "Criar grupo" : "Editar grupo"}
            </DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmitGroup(event)}>
            {modal === "create" ? (
              <div className="grid gap-2">
                <Label>WhatsApp</Label>
                <ComboboxSelect
                  value={groupDraft.instanceName}
                  options={snapshot.instances.map((instance) => ({
                    label: instance.displayName,
                    value: instance.instanceName,
                  }))}
                  onChange={(value) =>
                    setGroupDraft((current) => ({
                      ...current,
                      instanceName: value,
                      participants: [],
                    }))
                  }
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label>Nome do grupo</Label>
              <Input
                value={groupDraft.subject}
                disabled={isBusy}
                onChange={(event) =>
                  setGroupDraft((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Descricao</Label>
              <Textarea
                value={groupDraft.description}
                disabled={isBusy}
                rows={3}
                onChange={(event) =>
                  setGroupDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            {modal ? (
              <ParticipantPicker
                contacts={availableContacts}
                label={
                  modal === "create"
                    ? "Participantes"
                    : "Adicionar participantes"
                }
                selected={groupDraft.participants}
                onChange={(participants) =>
                  setGroupDraft((current) => ({ ...current, participants }))
                }
              />
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => setModal(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function MessageBubble({
  message,
  onCopy,
  onDelete,
  onReact,
  onReply,
}: {
  message: WhatsAppChatMessage
  onCopy: () => void
  onDelete: () => void
  onReact: (reaction: string) => void
  onReply: () => void
}) {
  return (
    <div
      className={cn(
        "group/message flex items-start gap-1",
        message.fromMe ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm",
          message.fromMe
            ? "rounded-tr-sm bg-primary/20 text-foreground"
            : "bg-card text-foreground"
        )}
      >
        {!message.fromMe ? (
          <div className="mb-1 text-xs font-medium text-primary">
            {message.senderName}
          </div>
        ) : null}
        {message.quoted ? (
          <div className="mb-2 rounded-md border-l-2 border-primary bg-background/60 px-2 py-1 text-xs text-muted-foreground">
            <span className="block font-medium text-primary">Resposta</span>
            <span className="line-clamp-2">{message.quoted.text}</span>
          </div>
        ) : null}
        {message.mediaUrl ? (
          <MessageMediaPreview message={message} />
        ) : null}
        <div className="whitespace-pre-wrap break-words">
          {message.text || messageTypeLabel(message.type)}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          <span>{formatShortTime(message.timestamp)}</span>
          {message.fromMe ? <MessageStatus status={message.status} /> : null}
        </div>
        {message.reaction ? (
          <div className="mt-1 inline-flex rounded-full bg-background px-1.5 py-0.5 text-xs shadow-sm">
            {message.reaction}
          </div>
        ) : null}
      </div>
      <MessageActions
        align={message.fromMe ? "end" : "start"}
        onCopy={onCopy}
        onDelete={onDelete}
        onReact={onReact}
        onReply={onReply}
      />
    </div>
  )
}

function MessageActions({
  align,
  onCopy,
  onDelete,
  onReact,
  onReply,
}: {
  align: "end" | "start"
  onCopy: () => void
  onDelete: () => void
  onReact: (reaction: string) => void
  onReply: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="mt-1 opacity-0 transition group-hover/message:opacity-100"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuItem onClick={onReply}>
          <ReplyIcon />
          Responder
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SmileIcon />
            Reagir
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="grid min-w-40 grid-cols-5 gap-1">
            {["👍", "❤️", "😂", "😮", "🙏"].map((reaction) => (
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
        <DropdownMenuItem onClick={onCopy}>
          <CopyIcon />
          Copiar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon />
          Apagar para todos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MessageMediaPreview({ message }: { message: WhatsAppChatMessage }) {
  const mediaType = messageTypeToMediaType(message.type)

  if (mediaType === "image") {
    return (
      <img
        src={message.mediaUrl ?? ""}
        alt={message.fileName ?? "Imagem"}
        className="mb-2 max-h-72 rounded-md object-cover"
      />
    )
  }

  if (mediaType === "video") {
    return (
      <video
        controls
        src={message.mediaUrl ?? ""}
        className="mb-2 max-h-72 rounded-md"
      />
    )
  }

  if (message.type.includes("audio")) {
    return <audio controls src={message.mediaUrl ?? ""} className="mb-2" />
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
  const normalized = status?.toUpperCase() ?? ""

  return (
    <CheckCheckIcon
      className={cn(
        "size-3.5",
        (normalized.includes("READ") || normalized.includes("PLAYED")) &&
          "text-sky-400",
        normalized.includes("PENDING") && "text-muted-foreground",
        normalized.includes("ERROR") && "text-destructive"
      )}
    />
  )
}

function GroupAvatar({
  group,
  large = false,
}: {
  group: WhatsAppGroup
  large?: boolean
}) {
  const className = cn(
    "inline-flex shrink-0 items-center justify-center rounded-full bg-muted bg-cover bg-center font-semibold",
    large ? "size-20 text-xl" : "size-10 text-sm"
  )

  if (group.pictureUrl) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ backgroundImage: `url(${group.pictureUrl})` }}
      />
    )
  }

  return (
    <span className={className}>
      <UsersIcon className={large ? "size-8" : "size-4"} />
    </span>
  )
}

function ParticipantPicker({
  contacts,
  label,
  onChange,
  selected,
}: {
  contacts: EvolutionContact[]
  label: string
  onChange: (selected: string[]) => void
  selected: string[]
}) {
  const [query, setQuery] = React.useState("")
  const selectedSet = React.useMemo(() => new Set(selected), [selected])
  const filteredContacts = React.useMemo(() => {
    const normalizedQuery = normalizeText(query)
    const numberQuery = query.replace(/\D/g, "")

    return contacts.filter((contact) => {
      if (!normalizedQuery && !numberQuery) {
        return true
      }

      return (
        normalizeText(contact.name).includes(normalizedQuery) ||
        contact.number.includes(numberQuery)
      )
    })
  }, [contacts, query])

  function toggle(number: string) {
    onChange(
      selectedSet.has(number)
        ? selected.filter((item) => item !== number)
        : [...selected, number]
    )
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="rounded-lg border border-border p-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              placeholder="Pesquisar contato"
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange(
                selected.length === contacts.length
                  ? []
                  : contacts.map((contact) => contact.number)
              )
            }
          >
            Selecionar lista
          </Button>
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
          {filteredContacts.length ? (
            filteredContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 border-b border-border/70 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40"
                onClick={() => toggle(contact.number)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{contact.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {contact.formattedNumber}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded border border-border",
                    selectedSet.has(contact.number) &&
                      "border-primary bg-primary text-primary-foreground"
                  )}
                >
                  {selectedSet.has(contact.number) ? (
                    <CheckIcon className="size-3" />
                  ) : null}
                </span>
              </button>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum contato encontrado.
            </div>
          )}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {selected.length} contatos selecionados
        </div>
      </div>
    </div>
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
      onValueChange={(option) => {
        if (option) {
          onChange(option.value)
        }
      }}
    >
      <ComboboxInput
        placeholder="Selecionar"
        className={cn("w-full bg-background", className)}
      />
      <ComboboxContent>
        <ComboboxEmpty>Nenhum item encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(option: ComboboxOption) => (
            <ComboboxItem key={option.value} value={option}>
              {option.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

async function fetchGroupsSnapshot() {
  const response = await fetch("/api/evolution-whatsapp/groups", {
    cache: "no-store",
  })

  return parseApiResponse<WhatsAppGroupsSnapshot>(response)
}

async function fetchChatSnapshot({
  instanceName,
  remoteJid,
}: {
  instanceName: string
  remoteJid: string
}) {
  const params = new URLSearchParams({
    instanceName,
    remoteJid,
  })
  const response = await fetch(`/api/evolution-whatsapp/chat?${params}`, {
    cache: "no-store",
  })

  return parseApiResponse<WhatsAppChatSnapshot>(response)
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

async function postGroupsAction(input: Record<string, unknown>) {
  const response = await fetch("/api/evolution-whatsapp/groups", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return parseApiResponse<GroupsActionResponse>(response)
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
        : "Nao foi possivel processar grupos."
    )
  }

  return data as T
}

function getRequestErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel processar grupos."
}

function createOptimisticMessage({
  instanceName,
  media,
  remoteJid,
  text,
}: {
  instanceName: string
  media: WhatsAppMediaPayload | null
  remoteJid: string
  text: string
}): WhatsAppChatMessage {
  const type = media ? `${media.mediatype}Message` : "conversation"

  return {
    fileName: media?.fileName ?? null,
    fromMe: true,
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    instanceName,
    mediaUrl: media?.media ?? null,
    mimetype: media?.mimetype ?? null,
    remoteJid,
    senderName: "Voce",
    status: "PENDING",
    text: text.trim() || messageTypeLabel(type),
    timestamp: new Date().toISOString(),
    type,
  }
}

function mergeOptimisticMessages(
  messages: WhatsAppChatMessage[],
  optimisticMessages: WhatsAppChatMessage[]
) {
  const messageIds = new Set(messages.map((message) => message.id))

  return [
    ...messages,
    ...optimisticMessages.filter((message) => !messageIds.has(message.id)),
  ]
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
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

function formatShortTime(value?: string | null) {
  if (!value) {
    return ""
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  })
    .format(new Date(value))
    .replace(",", "")
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

  return "document"
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

  return <FileIcon className="size-4" />
}

function fallbackFileName(type: WhatsAppMediaPayload["mediatype"]) {
  if (type === "image") {
    return "imagem.jpg"
  }

  if (type === "video") {
    return "video.mp4"
  }

  return "documento.pdf"
}

function defaultMimeType(type: WhatsAppMediaPayload["mediatype"]) {
  if (type === "image") {
    return "image/jpeg"
  }

  if (type === "video") {
    return "video/mp4"
  }

  return "application/pdf"
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")))
    reader.addEventListener("error", () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}
