"use client"

import * as React from "react"
import Image from "next/image"
import {
  AlertCircleIcon,
  CameraIcon,
  CheckCircle2Icon,
  Loader2Icon,
  MailIcon,
  MessageCircleIcon,
  MessageSquareTextIcon,
  PencilIcon,
  QrCodeIcon,
  RefreshCwIcon,
  Settings2Icon,
  SmartphoneIcon,
  UnplugIcon,
  UsersIcon,
  WorkflowIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  EVOLUTION_PLAN_LIMITS,
  getConnectedSlots,
  getReadyQrSlot,
  type EvolutionInstanceSettings,
  type EvolutionPlanCode,
  type EvolutionWhatsAppSettings,
  type EvolutionWhatsAppSlot,
} from "@/lib/evolution-whatsapp-local-store"
import { type CurrentUser } from "@/lib/auth"

type EvolutionAction =
  | "create"
  | "disconnect"
  | "get-settings"
  | "rename"
  | "refresh-qr"
  | "set-settings"
  | "sync"

type EvolutionActionResponse = {
  settings: EvolutionWhatsAppSettings
  instanceSettings?: EvolutionInstanceSettings
  qrSlot?: EvolutionWhatsAppSlot
}

type IntegrationCode = "whatsapp" | "instagram" | "sms" | "email" | "n8n"

const INTEGRATION_TABS: Array<{
  id: IntegrationCode
  label: string
  icon: LucideIcon
}> = [
  {
    id: "whatsapp",
    label: "Whatsapp",
    icon: MessageCircleIcon,
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: CameraIcon,
  },
  {
    id: "sms",
    label: "SMS",
    icon: MessageSquareTextIcon,
  },
  {
    id: "email",
    label: "E-mail",
    icon: MailIcon,
  },
  {
    id: "n8n",
    label: "n8n",
    icon: WorkflowIcon,
  },
]

const DEFAULT_INSTANCE_SETTINGS: EvolutionInstanceSettings = {
  rejectCall: false,
  msgCall: "",
  groupsIgnore: false,
  alwaysOnline: false,
  readMessages: false,
  readStatus: false,
  syncFullHistory: false,
}

export function WhatsAppSettingsPanel({ user }: { user: CurrentUser }) {
  const plan = user.plan as EvolutionPlanCode
  const [activeIntegration, setActiveIntegration] =
    React.useState<IntegrationCode>("whatsapp")
  const planRef = React.useRef(plan)
  const [settings, setSettings] =
    React.useState<EvolutionWhatsAppSettings | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [isCreatingInstance, setIsCreatingInstance] = React.useState(false)
  const [busyInstance, setBusyInstance] = React.useState<string | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isConnectModalOpen, setIsConnectModalOpen] = React.useState(false)
  const [editingSlot, setEditingSlot] =
    React.useState<EvolutionWhatsAppSlot | null>(null)
  const [editInstanceLabel, setEditInstanceLabel] = React.useState("")
  const [detailsSlot, setDetailsSlot] =
    React.useState<EvolutionWhatsAppSlot | null>(null)
  const [disconnectSlot, setDisconnectSlot] =
    React.useState<EvolutionWhatsAppSlot | null>(null)
  const [instanceLabel, setInstanceLabel] = React.useState("")
  const [settingsSlot, setSettingsSlot] =
    React.useState<EvolutionWhatsAppSlot | null>(null)
  const [instanceSettings, setInstanceSettings] =
    React.useState<EvolutionInstanceSettings>(DEFAULT_INSTANCE_SETTINGS)
  const [isInstanceSettingsLoading, setIsInstanceSettingsLoading] =
    React.useState(false)
  const [isInstanceSettingsSaving, setIsInstanceSettingsSaving] =
    React.useState(false)
  const [modalQrSlot, setModalQrSlot] =
    React.useState<EvolutionWhatsAppSlot | null>(null)

  const fetchSettings = React.useCallback(
    async (
      nextPlan: EvolutionPlanCode,
      options: { silent?: boolean } = {}
    ) => {
      if (!options.silent) {
        setIsSyncing(true)
      }

      try {
        const next = await fetchEvolutionSettings()

        setSettings(next)
        setErrorMessage(null)

        return next
      } catch (error) {
        const message = getRequestErrorMessage(error)

        setErrorMessage(message)

        if (!options.silent) {
          toast.error(message)
        }

        return null
      } finally {
        setIsLoading(false)

        if (!options.silent) {
          setIsSyncing(false)
        }
      }
    },
    []
  )

  React.useEffect(() => {
    void fetchSettings(planRef.current)
  }, [fetchSettings])

  React.useEffect(() => {
    planRef.current = plan
  }, [plan])

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchSettings(planRef.current, { silent: true })
    }, 6_000)

    return () => window.clearInterval(timer)
  }, [fetchSettings])

  const connectedSlots = React.useMemo(
    () => (settings ? getConnectedSlots(settings) : []),
    [settings]
  )
  const visibleConnectedSlots = connectedSlots
  const activeDetailsSlot =
    detailsSlot && visibleConnectedSlots.find((slot) => slot.id === detailsSlot.id)

  function handleOpenDetails(slot: EvolutionWhatsAppSlot) {
    setDetailsSlot(slot)
  }

  function handleCloseDetails() {
    setDetailsSlot(null)
  }
  const activePlan = settings?.plan ?? plan
  const planLimit = EVOLUTION_PLAN_LIMITS[activePlan].phoneLimit
  const instanceCount = settings?.slots.length ?? 0
  const activeModalQrSlot =
    modalQrSlot && settings
      ? settings.slots.find(
          (slot) =>
            slot.instanceName === modalQrSlot.instanceName &&
            slot.status === "qr_ready"
        ) ?? modalQrSlot
      : modalQrSlot

  function closeModalIfConnected(
    nextSettings: EvolutionWhatsAppSettings,
    targetSlot: EvolutionWhatsAppSlot | null
  ) {
    if (!targetSlot) {
      return
    }

    const connectedSlot = nextSettings.slots.find(
      (slot) =>
        slot.instanceName === targetSlot.instanceName &&
        slot.status === "connected"
    )

    if (connectedSlot) {
      setIsConnectModalOpen(false)
      setModalQrSlot(null)
      setInstanceLabel("")
      toast.success("WhatsApp conectado.")
    }
  }

  async function handleCheckConnection() {
    const next = await fetchSettings(planRef.current)

    if (next) {
      closeModalIfConnected(next, activeModalQrSlot)
      toast.success("Evolution sincronizada.")
    }
  }

  function handleRequestDisconnect(slot: EvolutionWhatsAppSlot) {
    setDisconnectSlot(slot)
  }

  function handleCloseDisconnectConfirm() {
    setDisconnectSlot(null)
  }

  async function handleConfirmDisconnect() {
    if (!disconnectSlot) {
      return
    }

    const next = await runEvolutionAction({
      action: "disconnect",
      instanceName: disconnectSlot.instanceName,
    })

    if (next) {
      setDisconnectSlot(null)
      toast.warning("Instancia desconectada.")
    }
  }

  async function handleRefreshStats() {
    const next = await fetchSettings(planRef.current)

    if (next) {
      toast.success("Estatisticas sincronizadas.")
    }
  }

  function handleOpenEditInstance(slot: EvolutionWhatsAppSlot) {
    setEditingSlot(slot)
    setEditInstanceLabel(slot.displayName)
  }

  function handleCloseEditInstance() {
    setEditingSlot(null)
    setEditInstanceLabel("")
  }

  async function handleRenameInstance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingSlot) {
      return
    }

    const targetInstanceName = editingSlot.instanceName

    setBusyInstance(targetInstanceName)
    setIsSyncing(true)

    try {
      const result = await postEvolutionAction({
        action: "rename",
        instanceName: targetInstanceName,
        instanceLabel: editInstanceLabel,
      })
      setSettings(result.settings)
      setErrorMessage(null)
      handleCloseEditInstance()
      toast.success("Instancia renomeada na Evolution.")
    } catch (error) {
      const message = getRequestErrorMessage(error)

      setErrorMessage(message)
      toast.error(message)
    } finally {
      setBusyInstance(null)
      setIsSyncing(false)
      setIsLoading(false)
    }
  }

  async function handleOpenInstanceSettings(slot: EvolutionWhatsAppSlot) {
    setSettingsSlot(slot)
    setInstanceSettings(DEFAULT_INSTANCE_SETTINGS)
    setIsInstanceSettingsLoading(true)

    try {
      const result = await postEvolutionAction({
        action: "get-settings",
        instanceName: slot.instanceName,
      })

      setSettings(result.settings)
      setInstanceSettings(result.instanceSettings ?? DEFAULT_INSTANCE_SETTINGS)
      setErrorMessage(null)
    } catch (error) {
      const message = getRequestErrorMessage(error)

      setErrorMessage(message)
      toast.error(message)
      setSettingsSlot(null)
    } finally {
      setIsInstanceSettingsLoading(false)
    }
  }

  function handleCloseInstanceSettings() {
    setSettingsSlot(null)
    setInstanceSettings(DEFAULT_INSTANCE_SETTINGS)
  }

  async function handleSaveInstanceSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!settingsSlot) {
      return
    }

    setIsInstanceSettingsSaving(true)

    try {
      const result = await postEvolutionAction({
        action: "set-settings",
        instanceName: settingsSlot.instanceName,
        instanceSettings,
      })

      setSettings(result.settings)
      setInstanceSettings(result.instanceSettings ?? instanceSettings)
      setErrorMessage(null)
      handleCloseInstanceSettings()
      toast.success("Configuracoes da instancia salvas.")
    } catch (error) {
      const message = getRequestErrorMessage(error)

      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsInstanceSettingsSaving(false)
    }
  }

  function handleOpenConnectModal() {
    const pendingSlot = settings?.slots.find((slot) => slot.status === "qr_ready")

    if (pendingSlot) {
      setModalQrSlot(pendingSlot)
      setInstanceLabel(pendingSlot.displayName)
      setIsConnectModalOpen(true)
      return
    }

    if (instanceCount >= planLimit) {
      toast.warning("Atualize seu plano para adicionar mais numeros de WhatsApp.")
      return
    }

    setModalQrSlot(null)
    setInstanceLabel("")
    setIsConnectModalOpen(true)
  }

  function handleCloseConnectModal() {
    setIsConnectModalOpen(false)
    setModalQrSlot(null)
    setInstanceLabel("")
  }

  async function handleCreateInstance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (instanceCount >= planLimit) {
      toast.warning("Atualize seu plano para adicionar mais numeros de WhatsApp.")
      return
    }

    setIsCreatingInstance(true)

    try {
      const result = await postEvolutionAction({
        action: "create",
        instanceLabel,
      })

      setSettings(result.settings)
      setModalQrSlot(result.qrSlot ?? getReadyQrSlot(result.settings) ?? null)
      setErrorMessage(null)
      toast.success("QR Code gerado.")
    } catch (error) {
      const message = getRequestErrorMessage(error)

      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsCreatingInstance(false)
      setIsLoading(false)
    }
  }

  async function handleRefreshModalQr() {
    if (!modalQrSlot) {
      return
    }

    const next = await runEvolutionAction({
      action: "refresh-qr",
      instanceName: modalQrSlot.instanceName,
    })

    if (next) {
      setModalQrSlot(
        next.slots.find((slot) => slot.instanceName === modalQrSlot.instanceName) ??
          getReadyQrSlot(next) ??
          modalQrSlot
      )
      toast.info("QR Code sincronizado.")
    }
  }

  async function runEvolutionAction({
    action,
    instanceName,
  }: {
    action: EvolutionAction
    instanceName?: string
  }) {
    setBusyInstance(instanceName ?? action)
    setIsSyncing(true)

    try {
      const next = await postEvolutionAction({
        action,
        instanceName,
      })

      setSettings(next.settings)
      setErrorMessage(null)

      return next.settings
    } catch (error) {
      const message = getRequestErrorMessage(error)

      setErrorMessage(message)
      toast.error(message)

      return null
    } finally {
      setBusyInstance(null)
      setIsSyncing(false)
      setIsLoading(false)
    }
  }

  if (activeIntegration !== "whatsapp") {
    return (
      <IntegrationSettingsShell
        activeIntegration={activeIntegration}
        onChangeIntegration={setActiveIntegration}
      >
        <IntegrationPlaceholder integration={activeIntegration} />
      </IntegrationSettingsShell>
    )
  }

  if (isLoading && !settings) {
    return (
      <LoadingSettingsPanel
        activeIntegration={activeIntegration}
        onChangeIntegration={setActiveIntegration}
      />
    )
  }

  if (!settings) {
    return (
      <SettingsErrorPanel
        activeIntegration={activeIntegration}
        message={errorMessage ?? "Nao foi possivel carregar a Evolution API."}
        onChangeIntegration={setActiveIntegration}
        onRetry={() => void fetchSettings(planRef.current)}
      />
    )
  }

  return (
    <IntegrationSettingsShell
      activeIntegration={activeIntegration}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={isSyncing || isCreatingInstance}
            onClick={handleOpenConnectModal}
          >
            <MessageCircleIcon />
            Conectar Whatsapp
          </Button>
        </div>
      }
      errorMessage={errorMessage}
      onChangeIntegration={setActiveIntegration}
    >
      <div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1">
        <div className="grid gap-4">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-3">
              <div className="grid auto-rows-fr gap-3 md:grid-cols-2">
                {visibleConnectedSlots.length ? (
                  visibleConnectedSlots.map((slot) => (
                    <ConnectedSlotCard
                      key={slot.id}
                      slot={slot}
                      isBusy={busyInstance === slot.instanceName}
                      onDisconnect={handleRequestDisconnect}
                      onEdit={handleOpenEditInstance}
                      onOpenDetails={handleOpenDetails}
                      onOpenSettings={handleOpenInstanceSettings}
                      onRefreshStats={handleRefreshStats}
                    />
                  ))
                ) : (
                  <EmptyConnectedState />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
      {isConnectModalOpen ? (
        <ConnectWhatsAppModal
          instanceLabel={instanceLabel}
          isBusy={isCreatingInstance || isSyncing}
          qrSlot={activeModalQrSlot}
          onChangeInstanceLabel={setInstanceLabel}
          onCheckConnection={handleCheckConnection}
          onClose={handleCloseConnectModal}
          onCreateInstance={handleCreateInstance}
          onRefreshQr={handleRefreshModalQr}
        />
      ) : null}
      {editingSlot ? (
        <EditInstanceModal
          instanceLabel={editInstanceLabel}
          isBusy={busyInstance === editingSlot.instanceName}
          onChangeInstanceLabel={setEditInstanceLabel}
          onClose={handleCloseEditInstance}
          onSubmit={handleRenameInstance}
        />
      ) : null}
      {activeDetailsSlot ? (
        <InstanceDetailsModal
          slot={activeDetailsSlot}
          onClose={handleCloseDetails}
        />
      ) : null}
      {settingsSlot ? (
        <InstanceSettingsModal
          instanceSettings={instanceSettings}
          isLoading={isInstanceSettingsLoading}
          isSaving={isInstanceSettingsSaving}
          onChange={setInstanceSettings}
          onClose={handleCloseInstanceSettings}
          onSubmit={handleSaveInstanceSettings}
        />
      ) : null}
      {disconnectSlot ? (
        <DisconnectConfirmModal
          isBusy={busyInstance === disconnectSlot.instanceName}
          slot={disconnectSlot}
          onClose={handleCloseDisconnectConfirm}
          onConfirm={handleConfirmDisconnect}
        />
      ) : null}
    </IntegrationSettingsShell>
  )
}

function IntegrationSettingsShell({
  activeIntegration,
  action,
  children,
  errorMessage,
  onChangeIntegration,
}: {
  activeIntegration: IntegrationCode
  action?: React.ReactNode
  children: React.ReactNode
  errorMessage?: string | null
  onChangeIntegration: (integration: IntegrationCode) => void
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/80 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <IntegrationTabs
            activeIntegration={activeIntegration}
            onChangeIntegration={onChangeIntegration}
          />
          {action}
        </div>

        {errorMessage ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </header>

      {children}
    </section>
  )
}

function IntegrationTabs({
  activeIntegration,
  onChangeIntegration,
}: {
  activeIntegration: IntegrationCode
  onChangeIntegration: (integration: IntegrationCode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Integracoes"
      className="flex min-w-0 flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {INTEGRATION_TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeIntegration === id

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChangeIntegration(id)}
            className={cn(
              "inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function IntegrationPlaceholder({
  integration,
}: {
  integration: IntegrationCode
}) {
  const option =
    INTEGRATION_TABS.find((item) => item.id === integration) ??
    INTEGRATION_TABS[0]
  const Icon = option.icon

  return (
    <div className="flex flex-1 items-center justify-center py-4 pr-1">
      <div className="flex min-h-56 w-full items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/50 p-6 text-center text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <Icon className="size-9" />
          <span>{option.label}</span>
        </div>
      </div>
    </div>
  )
}

function ConnectedSlotCard({
  slot,
  isBusy,
  onDisconnect,
  onEdit,
  onOpenDetails,
  onOpenSettings,
  onRefreshStats,
}: {
  slot: EvolutionWhatsAppSlot
  isBusy: boolean
  onDisconnect: (slot: EvolutionWhatsAppSlot) => void
  onEdit: (slot: EvolutionWhatsAppSlot) => void
  onOpenDetails: (slot: EvolutionWhatsAppSlot) => void
  onOpenSettings: (slot: EvolutionWhatsAppSlot) => void
  onRefreshStats: (slotId: string) => void
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      className="flex min-h-32 cursor-pointer flex-col rounded-lg border border-border/80 bg-card p-4 text-card-foreground transition-colors hover:border-primary/45"
      onClick={() => onOpenDetails(slot)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpenDetails(slot)
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <SmartphoneIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{slot.displayName}</h3>
              <StatusPill tone="success">Conectado</StatusPill>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {slot.phoneNumber ?? "Numero conectado"}
            </p>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          <IconButton
            label="Editar instancia"
            icon={PencilIcon}
            disabled={isBusy}
            onClick={() => onEdit(slot)}
          />
          <IconButton
            label="Configurar instancia"
            icon={Settings2Icon}
            disabled={isBusy}
            onClick={() => onOpenSettings(slot)}
          />
          <IconButton
            label="Sincronizar estatisticas"
            icon={RefreshCwIcon}
            disabled={isBusy}
            onClick={() => onRefreshStats(slot.id)}
          />
          <IconButton
            label="Desconectar numero"
            icon={UnplugIcon}
            variant="destructive"
            disabled={isBusy}
            onClick={() => onDisconnect(slot)}
          />
        </div>
      </div>
      <div className="mt-4 text-xs text-muted-foreground">
        Última sincronização: {formatDateTime(slot.lastSyncAt)}
      </div>
    </article>
  )
}

function EmptyConnectedState() {
  return (
    <div className="col-span-full flex min-h-56 items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/50 p-6 text-center text-sm text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <MessageCircleIcon className="size-9" />
        <span>Nenhum WhatsApp conectado.</span>
      </div>
    </div>
  )
}

function ConnectWhatsAppModal({
  instanceLabel,
  isBusy,
  qrSlot,
  onChangeInstanceLabel,
  onCheckConnection,
  onClose,
  onCreateInstance,
  onRefreshQr,
}: {
  instanceLabel: string
  isBusy: boolean
  qrSlot: EvolutionWhatsAppSlot | null
  onChangeInstanceLabel: (value: string) => void
  onCheckConnection: () => void
  onClose: () => void
  onCreateInstance: (event: React.FormEvent<HTMLFormElement>) => void
  onRefreshQr: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-border/80 bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Conectar Whatsapp</h2>
          </div>
          <IconButton label="Fechar" icon={XCircleIcon} onClick={onClose} />
        </div>

        <form className="mt-4 grid gap-4" onSubmit={onCreateInstance}>
          <div className="grid gap-2">
            <Label htmlFor="whatsapp-instance-name">Nome da instancia</Label>
            <Input
              id="whatsapp-instance-name"
              value={instanceLabel}
              disabled={Boolean(qrSlot) || isBusy}
              maxLength={48}
              placeholder="Ex: Atendimento vendas"
              onChange={(event) => onChangeInstanceLabel(event.target.value)}
            />
          </div>

          {!qrSlot ? (
            <Button type="submit" disabled={isBusy || !instanceLabel.trim()}>
              {isBusy ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <QrCodeIcon />
              )}
              Gerar QR Code
            </Button>
          ) : null}
        </form>

        {qrSlot ? (
          <div className="mt-4 grid gap-4">
            <div className="flex min-h-72 items-center justify-center rounded-md border border-border/70 bg-background p-4">
              <EvolutionQrImage slot={qrSlot} />
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground">
              <span>Gerado: {formatDateTime(qrSlot.qrGeneratedAt)}</span>
              {qrSlot.pairingCode ? <span>Codigo: {qrSlot.pairingCode}</span> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={isBusy} onClick={onCheckConnection}>
                {isBusy ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <CheckCircle2Icon />
                )}
                Verificar conexao
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={onRefreshQr}
              >
                <RefreshCwIcon />
                Novo QR
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function EditInstanceModal({
  instanceLabel,
  isBusy,
  onChangeInstanceLabel,
  onClose,
  onSubmit,
}: {
  instanceLabel: string
  isBusy: boolean
  onChangeInstanceLabel: (value: string) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border/80 bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Editar instancia</h2>
          <IconButton label="Fechar" icon={XCircleIcon} onClick={onClose} />
        </div>

        <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="edit-whatsapp-instance-name">Nome exibido</Label>
            <Input
              id="edit-whatsapp-instance-name"
              value={instanceLabel}
              disabled={isBusy}
              maxLength={48}
              onChange={(event) => onChangeInstanceLabel(event.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={isBusy} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isBusy || !instanceLabel.trim()}>
              {isBusy ? <Loader2Icon className="animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InstanceDetailsModal({
  slot,
  onClose,
}: {
  slot: EvolutionWhatsAppSlot
  onClose: () => void
}) {
  const stats = slot.stats

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl rounded-lg border border-border/80 bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{slot.displayName}</h2>
              <StatusPill tone="success">Conectado</StatusPill>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {slot.phoneNumber ?? "Numero conectado"}
            </p>
          </div>
          <IconButton label="Fechar" icon={XCircleIcon} onClick={onClose} />
        </div>

        <Separator className="my-4" />

        {stats ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniStat icon={MessageCircleIcon} label="Chats" value={stats.chats} />
            <MiniStat icon={UsersIcon} label="Grupos" value={stats.groups} />
            <MiniStat
              icon={MessageSquareTextIcon}
              label="Mensagens"
              value={stats.totalMessages}
            />
            <MiniStat icon={UsersIcon} label="Contatos" value={stats.contacts} />
          </div>
        ) : (
          <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-border/80 text-sm text-muted-foreground">
            Sem estatisticas disponiveis.
          </div>
        )}

        <div className="mt-4 text-xs text-muted-foreground">
          Última sincronização: {formatDateTime(slot.lastSyncAt)}
        </div>
      </div>
    </div>
  )
}

function InstanceSettingsModal({
  instanceSettings,
  isLoading,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  instanceSettings: EvolutionInstanceSettings
  isLoading: boolean
  isSaving: boolean
  onChange: (settings: EvolutionInstanceSettings) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  function updateSetting<Key extends keyof EvolutionInstanceSettings>(
    key: Key,
    value: EvolutionInstanceSettings[Key]
  ) {
    onChange({
      ...instanceSettings,
      [key]: value,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-border/80 bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Configurar instancia</h2>
          <IconButton label="Fechar" icon={XCircleIcon} onClick={onClose} />
        </div>

        {isLoading ? (
          <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            Carregando configuracoes...
          </div>
        ) : (
          <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
            <CheckboxField
              checked={instanceSettings.rejectCall}
              label="Bloquear ligacoes"
              onChange={(checked) => updateSetting("rejectCall", checked)}
            />

            <div className="grid gap-2">
              <Label htmlFor="instance-call-message">
                Mensagem para ligacao bloqueada
              </Label>
              <Input
                id="instance-call-message"
                value={instanceSettings.msgCall}
                disabled={!instanceSettings.rejectCall}
                placeholder="Nao aceitamos ligacoes por este numero."
                onChange={(event) => updateSetting("msgCall", event.target.value)}
              />
            </div>

            <CheckboxField
              checked={instanceSettings.groupsIgnore}
              label="Ignorar mensagens de grupos"
              onChange={(checked) => updateSetting("groupsIgnore", checked)}
            />
            <CheckboxField
              checked={instanceSettings.alwaysOnline}
              label="Manter WhatsApp sempre online"
              onChange={(checked) => updateSetting("alwaysOnline", checked)}
            />
            <CheckboxField
              checked={instanceSettings.readMessages}
              label="Marcar mensagens recebidas como lidas"
              onChange={(checked) => updateSetting("readMessages", checked)}
            />
            <CheckboxField
              checked={instanceSettings.readStatus}
              label="Ler status do WhatsApp"
              onChange={(checked) => updateSetting("readStatus", checked)}
            />
            <CheckboxField
              checked={instanceSettings.syncFullHistory}
              label="Sincronizar historico completo"
              onChange={(checked) => updateSetting("syncFullHistory", checked)}
            />

            <div className="flex justify-end gap-2 border-t border-border/80 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2Icon className="animate-spin" /> : null}
                Salvar configuracoes
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function DisconnectConfirmModal({
  isBusy,
  slot,
  onClose,
  onConfirm,
}: {
  isBusy: boolean
  slot: EvolutionWhatsAppSlot
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-border/80 bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Desconectar instancia?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tem certeza que deseja desconectar {slot.displayName}?
            </p>
          </div>
          <IconButton label="Fechar" icon={XCircleIcon} onClick={onClose} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isBusy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="text-white hover:text-white dark:text-white"
            disabled={isBusy}
            onClick={onConfirm}
          >
            {isBusy ? <Loader2Icon className="animate-spin" /> : <UnplugIcon />}
            Desconectar
          </Button>
        </div>
      </div>
    </div>
  )
}

function CheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-md border border-border/70 bg-background px-3 py-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        className="size-4 accent-primary"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "info" | "neutral"
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
        tone === "success" &&
          "border-primary/30 bg-primary/10 text-primary",
        tone === "info" && "border-sky-400/30 bg-sky-500/10 text-sky-300",
        tone === "neutral" &&
          "border-border bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  )
}

function IconButton({
  label,
  icon: Icon,
  variant = "outline",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "size"> & {
  label: string
  icon: LucideIcon
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant={variant}
            aria-label={label}
            className={className}
            {...props}
          />
        }
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-md bg-background p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-3.5" />
      </div>
      <div className="mt-2 text-lg font-semibold">{formatNumber(value)}</div>
    </div>
  )
}

function EvolutionQrImage({
  slot,
  compact,
}: {
  slot: EvolutionWhatsAppSlot
  compact?: boolean
}) {
  if (slot.qrImage) {
    return (
      <Image
        src={slot.qrImage}
        alt="QR Code da Evolution"
        width={224}
        height={224}
        unoptimized
        className={cn(
          "aspect-square w-full rounded-md bg-white p-2",
          compact ? "max-w-52" : "max-w-56"
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        "flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted p-4 text-center text-muted-foreground",
        compact ? "max-w-52" : "max-w-56"
      )}
    >
      <QrCodeIcon className="size-9" />
      <span className="text-sm">QR indisponivel</span>
      {slot.qrCode ? (
        <span className="max-w-full truncate text-xs">{slot.qrCode}</span>
      ) : null}
    </div>
  )
}

function LoadingSettingsPanel({
  activeIntegration,
  onChangeIntegration,
}: {
  activeIntegration: IntegrationCode
  onChangeIntegration: (integration: IntegrationCode) => void
}) {
  return (
    <IntegrationSettingsShell
      activeIntegration={activeIntegration}
      onChangeIntegration={onChangeIntegration}
    >
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <Loader2Icon className="mr-2 size-4 animate-spin" />
        Conectando na Evolution API...
      </div>
    </IntegrationSettingsShell>
  )
}

function SettingsErrorPanel({
  activeIntegration,
  message,
  onChangeIntegration,
  onRetry,
}: {
  activeIntegration: IntegrationCode
  message: string
  onChangeIntegration: (integration: IntegrationCode) => void
  onRetry: () => void
}) {
  return (
    <IntegrationSettingsShell
      activeIntegration={activeIntegration}
      onChangeIntegration={onChangeIntegration}
    >
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-border/80 bg-card p-4 text-card-foreground">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Evolution indisponivel</h2>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            </div>
          </div>
          <Button type="button" className="mt-4" onClick={onRetry}>
            <RefreshCwIcon />
            Tentar novamente
          </Button>
        </div>
      </div>
    </IntegrationSettingsShell>
  )
}

async function fetchEvolutionSettings() {
  const response = await fetch("/api/evolution-whatsapp/settings", {
    cache: "no-store",
  })

  return parseEvolutionResponse<EvolutionWhatsAppSettings>(response)
}

async function postEvolutionAction({
  action,
  instanceLabel,
  instanceName,
  instanceSettings,
}: {
  action: EvolutionAction
  instanceLabel?: string
  instanceName?: string
  instanceSettings?: EvolutionInstanceSettings
}) {
  const response = await fetch("/api/evolution-whatsapp/actions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      instanceLabel,
      instanceName,
      instanceSettings,
    }),
  })

  return parseEvolutionResponse<EvolutionActionResponse>(response)
}

async function parseEvolutionResponse<T>(response: Response) {
  const data = (await response.json().catch(() => undefined)) as
    | { message?: string; detail?: string }
    | T
    | undefined

  if (!response.ok) {
    const message =
      isApiErrorBody(data) && data.message
        ? data.message
        : "A Evolution API retornou erro."

    throw new Error(message)
  }

  return data as T
}

function isApiErrorBody(
  value: unknown
): value is { message?: string; detail?: string } {
  return typeof value === "object" && value !== null && "message" in value
}

function getRequestErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel conectar na Evolution API."
}

function formatNumber(value: number | string) {
  if (typeof value === "string") {
    return value
  }

  return new Intl.NumberFormat("pt-BR").format(value)
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(new Date(value))
    .replace(",", "")
}
