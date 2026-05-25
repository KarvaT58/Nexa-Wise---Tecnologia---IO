"use client"

import * as React from "react"
import {
  BanIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockIcon,
  EyeIcon,
  FileIcon,
  ImageIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
  UsersIcon,
  VideoIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  type WhatsAppCampaignActionResult,
  type WhatsAppCampaignAudienceModeCode,
  type WhatsAppCampaignInput,
  type WhatsAppCampaignItem,
  type WhatsAppCampaignMediaDraft,
  type WhatsAppCampaignMessageDraft,
  type WhatsAppCampaignMessageTypeCode,
  type WhatsAppCampaignSnapshot,
} from "@/lib/whatsapp-campaigns-types"
import { type EvolutionContact } from "@/lib/evolution-contacts-types"

type CampaignAction =
  | "cancel"
  | "delete"
  | "pause"
  | "prepare"
  | "process"
  | "resume"
  | "save"

type ComboboxOption = {
  label: string
  value: string
}

const DEFAULT_OPT_OUT =
  "Responda PARAR para nao receber mais mensagens."
const ALL_INSTANCES_VALUE = "__ALL_INSTANCES__"
const MULTIPLE_INSTANCES_VALUE = "__MULTIPLE_INSTANCES__"
const MAX_MEDIA_ATTACHMENTS = 3
const WEEKDAYS = [
  { label: "Seg", value: "monday" },
  { label: "Ter", value: "tuesday" },
  { label: "Qua", value: "wednesday" },
  { label: "Qui", value: "thursday" },
  { label: "Sex", value: "friday" },
  { label: "Sab", value: "saturday" },
  { label: "Dom", value: "sunday" },
]
const MESSAGE_TYPES: Array<{
  icon: LucideIcon
  label: string
  value: WhatsAppCampaignMessageTypeCode
}> = [
  { icon: SendIcon, label: "Texto", value: "TEXT" },
  { icon: ImageIcon, label: "Imagem", value: "IMAGE" },
  { icon: VideoIcon, label: "Video", value: "VIDEO" },
  { icon: FileIcon, label: "Documento", value: "DOCUMENT" },
]

export function WhatsAppCampaignsPanel() {
  const [snapshot, setSnapshot] =
    React.useState<WhatsAppCampaignSnapshot | null>(null)
  const [draft, setDraft] = React.useState<WhatsAppCampaignInput>(
    createEmptyDraft()
  )
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string | null>(
    null
  )
  const [detailsCampaignId, setDetailsCampaignId] = React.useState<string | null>(
    null
  )
  const [isEditorOpen, setIsEditorOpen] = React.useState(false)
  const [campaignToDelete, setCampaignToDelete] =
    React.useState<WhatsAppCampaignItem | null>(null)
  const [editorStep, setEditorStep] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)
  const [busyAction, setBusyAction] = React.useState<CampaignAction | null>(null)
  const [contactQuery, setContactQuery] = React.useState("")
  const busyActionRef = React.useRef<CampaignAction | null>(null)
  const snapshotRef = React.useRef<WhatsAppCampaignSnapshot | null>(null)

  const fetchSnapshot = React.useCallback(async (silent = false) => {
    if (!silent) {
      setBusyAction("process")
    }

    try {
      const next = await getCampaignSnapshot()
      setSnapshot(next)

      if (selectedCampaignId) {
        const selected = next.campaigns.find(
          (campaign) => campaign.id === selectedCampaignId
        )

        if (selected) {
          setDraft(campaignToInput(selected))
        }
      }

      return next
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
      return null
    } finally {
      setBusyAction(null)
      setIsLoading(false)
    }
  }, [selectedCampaignId])

  React.useEffect(() => {
    busyActionRef.current = busyAction
  }, [busyAction])

  React.useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSnapshot(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [fetchSnapshot])

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const currentSnapshot = snapshotRef.current
      const hasPendingRunnable = currentSnapshot?.campaigns.some((campaign) => {
        return (
          campaign.jobSummary.pending > 0 &&
          (campaign.status === "RUNNING" || campaign.status === "SCHEDULED")
        )
      })

      if (hasPendingRunnable && !busyActionRef.current) {
        void postCampaignAction({ action: "process" })
          .then((result) => {
            setSnapshot(result.snapshot)
          })
          .catch(() => undefined)
      }
    }, 15_000)

    return () => window.clearInterval(timer)
  }, [])

  const detailsCampaign = snapshot?.campaigns.find(
    (campaign) => campaign.id === detailsCampaignId
  )
  const estimatedAudience = React.useMemo(() => {
    if (!snapshot) {
      return []
    }

    return selectDraftAudience(draft, snapshot.contacts)
  }, [draft, snapshot])
  const previewContact = estimatedAudience[0] ?? snapshot?.contacts[0]
  const previewMessage = draft.messages[0]

  async function runCampaignAction({
    action,
    campaignId,
    input,
    silent,
  }: {
    action: CampaignAction
    campaignId?: string
    input?: WhatsAppCampaignInput
    silent?: boolean
  }) {
    if (!silent) {
      setBusyAction(action)
    }

    try {
      const result = await postCampaignAction({
        action,
        campaignId,
        input,
      })

      setSnapshot(result.snapshot)

      if (result.campaign) {
        setSelectedCampaignId(result.campaign.id)
        setDraft(campaignToInput(result.campaign))
      } else if (selectedCampaignId) {
        const nextSelected = result.snapshot.campaigns.find(
          (campaign) => campaign.id === selectedCampaignId
        )

        if (nextSelected) {
          setDraft(campaignToInput(nextSelected))
        }
      }

      if (!silent) {
        showActionToast(action, result)
      }

      return result
    } catch (error) {
      if (!silent) {
        toast.error(getRequestErrorMessage(error))
      }

      return null
    } finally {
      if (!silent) {
        setBusyAction(null)
      }
      setIsLoading(false)
    }
  }

  function selectCampaign(campaign: WhatsAppCampaignItem) {
    setDetailsCampaignId(campaign.id)
  }

  function startNewCampaign() {
    setSelectedCampaignId(null)
    setDraft(createEmptyDraft())
    setContactQuery("")
    setEditorStep(1)
    setIsEditorOpen(true)
  }

  function editCampaign(campaign: WhatsAppCampaignItem) {
    setDetailsCampaignId(null)
    setSelectedCampaignId(campaign.id)
    setDraft(campaignToInput(campaign))
    setContactQuery("")
    setEditorStep(1)
    setIsEditorOpen(true)
  }

  async function deleteCampaign() {
    if (!campaignToDelete) {
      return
    }

    const deletedId = campaignToDelete.id
    const result = await runCampaignAction({
      action: "delete",
      campaignId: deletedId,
    })

    if (result) {
      setCampaignToDelete(null)

      if (selectedCampaignId === deletedId) {
        setSelectedCampaignId(null)
        setDraft(createEmptyDraft())
      }

      if (detailsCampaignId === deletedId) {
        setDetailsCampaignId(null)
      }
    }
  }

  if (isLoading && !snapshot) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center overflow-hidden rounded-lg bg-background">
        <Loader2Icon className="mr-2 size-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Carregando campanhas...</span>
      </section>
    )
  }

  if (!snapshot) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center overflow-hidden rounded-lg bg-background">
        <Button type="button" onClick={() => void fetchSnapshot()}>
          <RefreshCwIcon />
          Tentar novamente
        </Button>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
      <header className="shrink-0 border-b border-border/80 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">
              Campanhas do WhatsApp
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <MetricPill icon={SendIcon} label={`${snapshot.totals.campaigns} campanhas`} />
              <MetricPill icon={ClockIcon} label={`${snapshot.totals.pendingJobs} na fila`} />
              <MetricPill icon={CheckCircle2Icon} label={`${snapshot.totals.sentJobs} enviados`} />
              <MetricPill icon={XCircleIcon} label={`${snapshot.totals.failedJobs} falhas`} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(busyAction)}
              onClick={() => void fetchSnapshot()}
            >
              {busyAction === "process" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
              Atualizar
            </Button>
            <Button type="button" onClick={startNewCampaign}>
              <PlusIcon />
              Nova campanha
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {snapshot.campaigns.length ? (
          <div className="grid gap-3">
            {snapshot.campaigns.map((campaign) => (
              <CampaignListItem
                key={campaign.id}
                campaign={campaign}
                isBusy={Boolean(busyAction)}
                onCancel={() =>
                  void runCampaignAction({
                    action: "cancel",
                    campaignId: campaign.id,
                  })
                }
                onDelete={() => setCampaignToDelete(campaign)}
                onEdit={() => editCampaign(campaign)}
                onOpen={() => selectCampaign(campaign)}
                onPause={() =>
                  void runCampaignAction({
                    action: "pause",
                    campaignId: campaign.id,
                  })
                }
                onProcess={() => void runCampaignAction({ action: "process" })}
                onResume={() =>
                  void runCampaignAction({
                    action: "resume",
                    campaignId: campaign.id,
                  })
                }
              />
            ))}
          </div>
        ) : (
          <EmptyCampaignsState onCreate={startNewCampaign} />
        )}
      </div>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCampaignId ? "Editar campanha" : "Nova campanha"}
            </DialogTitle>
            <DialogDescription>
              Etapa {editorStep} de 4: {getEditorStepTitle(editorStep)}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <CampaignEditor
              contactQuery={contactQuery}
              draft={draft}
              editorStep={editorStep}
              estimatedAudience={estimatedAudience}
              instances={snapshot.instances.map((instance) => ({
                label: instance.displayName,
                value: instance.instanceName,
              }))}
              isBusy={Boolean(busyAction)}
              labels={snapshot.labels}
              onChangeContactQuery={setContactQuery}
              onChangeDraft={setDraft}
              previewContact={previewContact}
              previewMessage={previewMessage}
              snapshot={snapshot}
            />
          </div>
          <DialogFooter className="shrink-0">
            {editorStep > 1 ? (
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(busyAction)}
                onClick={() => setEditorStep((step) => Math.max(1, step - 1))}
              >
                Voltar
              </Button>
            ) : null}
            {editorStep < 4 ? (
              <Button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => setEditorStep((step) => Math.min(4, step + 1))}
              >
                Proximo
              </Button>
            ) : null}
            {editorStep === 4 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={Boolean(busyAction)}
                  onClick={() =>
                    void runCampaignAction({
                      action: "save",
                      input: draft,
                    }).then((result) => {
                      if (result) {
                        setIsEditorOpen(false)
                      }
                    })
                  }
                >
                  {busyAction === "save" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SaveIcon />
                  )}
                  Salvar rascunho
                </Button>
                <Button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() =>
                    void runCampaignAction({
                      action: "prepare",
                      input: draft,
                    }).then((result) => {
                      if (result) {
                        setIsEditorOpen(false)
                      }
                    })
                  }
                >
                  {busyAction === "prepare" ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SendIcon />
                  )}
                  Preparar e iniciar
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailsCampaign)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsCampaignId(null)
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-5xl">
          {detailsCampaign ? (
            <CampaignDetailsDialog
              campaign={detailsCampaign}
              isBusy={Boolean(busyAction)}
              onCancel={() =>
                void runCampaignAction({
                  action: "cancel",
                  campaignId: detailsCampaign.id,
                })
              }
              onDelete={() => setCampaignToDelete(detailsCampaign)}
              onEdit={() => editCampaign(detailsCampaign)}
              onPause={() =>
                void runCampaignAction({
                  action: "pause",
                  campaignId: detailsCampaign.id,
                })
              }
              onProcess={() => void runCampaignAction({ action: "process" })}
              onResume={() =>
                void runCampaignAction({
                  action: "resume",
                  campaignId: detailsCampaign.id,
                })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(campaignToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setCampaignToDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {campaignToDelete?.name}? Essa acao
              remove a campanha, fila e eventos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void deleteCampaign()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function CampaignListItem({
  campaign,
  isBusy,
  onCancel,
  onDelete,
  onEdit,
  onOpen,
  onPause,
  onProcess,
  onResume,
}: {
  campaign: WhatsAppCampaignItem
  isBusy: boolean
  onCancel: () => void
  onDelete: () => void
  onEdit: () => void
  onOpen: () => void
  onPause: () => void
  onProcess: () => void
  onResume: () => void
}) {
  const metrics = getCampaignMetrics(campaign)

  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-lg border border-border/80 bg-card/60 p-4 text-card-foreground outline-none transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">{campaign.name}</h2>
            <StatusBadge status={campaign.status} />
          </div>
          <CampaignActionsMenu
            campaign={campaign}
            isBusy={isBusy}
            onCancel={onCancel}
            onDelete={onDelete}
            onEdit={onEdit}
            onOpen={onOpen}
            onPause={onPause}
            onProcess={onProcess}
            onResume={onResume}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CampaignMetric icon={UsersIcon} label="Contatos" value={metrics.contacts} />
          <CampaignMetric icon={SendIcon} label="Enviadas" value={metrics.sent} />
          <CampaignMetric icon={EyeIcon} label="Lidas" value={metrics.read} />
          <CampaignMetric icon={XCircleIcon} label="Falhas" value={metrics.failed} />
        </div>
        {campaign.status !== "COMPLETED" ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{metrics.progress}% concluida</span>
              <span>{metrics.progressLabel}</span>
            </div>
            <Progress value={metrics.progress} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CampaignActionsMenu({
  campaign,
  isBusy,
  onCancel,
  onDelete,
  onEdit,
  onOpen,
  onPause,
  onProcess,
  onResume,
}: {
  campaign: WhatsAppCampaignItem
  isBusy: boolean
  onCancel: () => void
  onDelete: () => void
  onEdit: () => void
  onOpen: () => void
  onPause: () => void
  onProcess: () => void
  onResume: () => void
}) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Acoes da campanha"
              disabled={isBusy}
            />
          }
        >
          <ChevronRightIcon
            className={cn("transition-transform", isOpen && "rotate-90")}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom" className="w-52">
          <DropdownMenuItem onClick={onOpen}>
            <EyeIcon />
            Ver detalhes
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isBusy} onClick={onEdit}>
            <PencilIcon />
            Editar campanha
          </DropdownMenuItem>
          {campaign.jobSummary.pending ? (
            <DropdownMenuItem disabled={isBusy} onClick={onProcess}>
              <PlayIcon />
              Processar fila
            </DropdownMenuItem>
          ) : null}
          {campaign.status === "RUNNING" || campaign.status === "SCHEDULED" ? (
            <DropdownMenuItem disabled={isBusy} onClick={onPause}>
              <PauseIcon />
              Pausar campanha
            </DropdownMenuItem>
          ) : null}
          {campaign.status === "PAUSED" ? (
            <DropdownMenuItem disabled={isBusy} onClick={onResume}>
              <PlayIcon />
              Retomar campanha
            </DropdownMenuItem>
          ) : null}
          {campaign.status !== "CANCELED" && campaign.status !== "COMPLETED" ? (
            <DropdownMenuItem disabled={isBusy} onClick={onCancel}>
              <BanIcon />
              Cancelar campanha
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isBusy}
            variant="destructive"
            onClick={onDelete}
          >
            <Trash2Icon />
            Excluir campanha
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function CampaignDetailsDialog({
  campaign,
  isBusy,
  onCancel,
  onDelete,
  onEdit,
  onPause,
  onProcess,
  onResume,
}: {
  campaign: WhatsAppCampaignItem
  isBusy: boolean
  onCancel: () => void
  onDelete: () => void
  onEdit: () => void
  onPause: () => void
  onProcess: () => void
  onResume: () => void
}) {
  const metrics = getCampaignMetrics(campaign)

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle>{campaign.name}</DialogTitle>
          <StatusBadge status={campaign.status} />
        </div>
        <DialogDescription>
          Acompanhe fila, progresso, mensagens e eventos da campanha.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto pr-1">
        <div className="grid gap-4">
          <div className="rounded-lg border border-border/80 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <CampaignMetric icon={UsersIcon} label="Contatos" value={metrics.contacts} />
              <CampaignMetric icon={SendIcon} label="Enviadas" value={metrics.sent} />
              <CampaignMetric icon={EyeIcon} label="Lidas" value={metrics.read} />
              <CampaignMetric icon={XCircleIcon} label="Falhas" value={metrics.failed} />
            </div>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{metrics.progress}% concluida</span>
                <span>{metrics.progressLabel}</span>
              </div>
              <Progress value={metrics.progress} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoTile
              label="Inicio"
              value={metrics.startedAt ? formatDateTime(metrics.startedAt) : "-"}
            />
            <InfoTile
              label="Estimativa de final"
              value={metrics.estimatedEnd ? formatDateTime(metrics.estimatedEnd) : "-"}
            />
            <InfoTile
              label="Intervalo"
              value={`${campaign.minDelaySeconds}s a ${campaign.maxDelaySeconds}s`}
            />
          </div>
          <CampaignResults campaign={campaign} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={isBusy} onClick={onEdit}>
          <PencilIcon />
          Editar
        </Button>
        {campaign.jobSummary.pending ? (
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={onProcess}
          >
            <PlayIcon />
            Processar fila
          </Button>
        ) : null}
        {campaign.status === "RUNNING" || campaign.status === "SCHEDULED" ? (
          <Button type="button" variant="outline" disabled={isBusy} onClick={onPause}>
            <PauseIcon />
            Pausar
          </Button>
        ) : null}
        {campaign.status === "PAUSED" ? (
          <Button type="button" variant="outline" disabled={isBusy} onClick={onResume}>
            <PlayIcon />
            Retomar
          </Button>
        ) : null}
        {campaign.status !== "CANCELED" && campaign.status !== "COMPLETED" ? (
          <Button type="button" variant="outline" disabled={isBusy} onClick={onCancel}>
            <BanIcon />
            Cancelar
          </Button>
        ) : null}
        <Button type="button" variant="destructive" disabled={isBusy} onClick={onDelete}>
          <Trash2Icon />
          Excluir
        </Button>
      </DialogFooter>
    </>
  )
}

function EmptyCampaignsState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/40 p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MessageSquareTextIcon className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Nenhuma campanha criada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie uma campanha com publico, mensagens, agenda e fila controlada.
        </p>
        <Button type="button" className="mt-4" onClick={onCreate}>
          <PlusIcon />
          Nova campanha
        </Button>
      </div>
    </div>
  )
}

function CampaignMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="size-3.5" />
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/80 bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  )
}

function CampaignEditor({
  contactQuery,
  draft,
  editorStep,
  estimatedAudience,
  instances,
  isBusy,
  labels,
  onChangeContactQuery,
  onChangeDraft,
  previewContact,
  previewMessage,
  snapshot,
}: {
  contactQuery: string
  draft: WhatsAppCampaignInput
  editorStep: number
  estimatedAudience: EvolutionContact[]
  instances: ComboboxOption[]
  isBusy: boolean
  labels: string[]
  onChangeContactQuery: (value: string) => void
  onChangeDraft: (draft: WhatsAppCampaignInput) => void
  previewContact?: EvolutionContact
  previewMessage?: WhatsAppCampaignMessageDraft
  snapshot: WhatsAppCampaignSnapshot
}) {
  const filteredContacts = React.useMemo(() => {
    const normalizedQuery = normalizeText(contactQuery)
    const numberQuery = contactQuery.replace(/\D/g, "")

    return snapshot.contacts
      .filter((contact) => {
        if (!normalizedQuery && !numberQuery) {
          return true
        }

        const contactNumber = contact.number.replace(/\D/g, "")
        const formattedNumber = contact.formattedNumber.replace(/\D/g, "")
        const matchesName = normalizedQuery
          ? normalizeText(contact.name).includes(normalizedQuery)
          : false
        const matchesNumber = numberQuery
          ? contactNumber.includes(numberQuery) ||
            formattedNumber.includes(numberQuery)
          : false

        return matchesName || matchesNumber
      })
      .slice(0, 80)
  }, [contactQuery, snapshot.contacts])

  return (
    <div className="grid gap-4">
      <StepIndicator currentStep={editorStep} />

      {editorStep === 1 ? (
        <div className="grid gap-4 rounded-lg border border-border/80 p-4">
          <div className="grid gap-2">
            <Label htmlFor="campaign-name">Nome da campanha</Label>
            <Input
              id="campaign-name"
              value={draft.name}
              disabled={isBusy}
              onChange={(event) =>
                onChangeDraft({ ...draft, name: event.target.value })
              }
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Publico</Label>
              <ComboboxSelect
                value={draft.audienceMode}
                disabled={isBusy}
                options={[
                  { label: "Todos os contatos", value: "ALL" },
                  { label: "Selecionar contatos", value: "CUSTOM" },
                  { label: "Por etiquetas", value: "FILTER" },
                ]}
                onChange={(value) =>
                  onChangeDraft({
                    ...draft,
                    audienceMode: value as WhatsAppCampaignAudienceModeCode,
                  })
                }
              />
            </div>
            <InstanceSelect
              disabled={isBusy}
              instances={instances}
              selectedValues={draft.selectedInstanceNames}
              onChange={(selectedInstanceNames) =>
                onChangeDraft({
                  ...draft,
                  selectedInstanceNames,
                })
              }
            />
          </div>

          {draft.audienceMode === "FILTER" ? (
            <CheckboxSelectionBox
              disabled={isBusy}
              label="Etiquetas"
              emptyLabel="Selecione uma ou mais etiquetas"
              options={labels.map((label) => ({ label, value: label }))}
              selectedValues={draft.includedLabels}
              onToggle={(value) =>
                onChangeDraft({
                  ...draft,
                  audienceMode:
                    draft.audienceMode === "ALL" ? "FILTER" : draft.audienceMode,
                  includedLabels: toggleValue(draft.includedLabels, value),
                })
              }
            />
          ) : null}

          {draft.audienceMode === "CUSTOM" ? (
            <ContactSelectionBox
              contactQuery={contactQuery}
              contacts={filteredContacts}
              disabled={isBusy}
              selectedContactIds={draft.selectedContactIds}
              onChangeContactQuery={onChangeContactQuery}
              onSetSelectedContactIds={(selectedContactIds) =>
                onChangeDraft({ ...draft, selectedContactIds })
              }
              onToggleContact={(contactId) =>
                onChangeDraft({
                  ...draft,
                  selectedContactIds: toggleValue(
                    draft.selectedContactIds,
                    contactId
                  ),
                })
              }
            />
          ) : null}

          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground">Publico estimado</div>
            <div className="mt-1 text-2xl font-semibold">
              {estimatedAudience.length}
            </div>
          </div>
        </div>
      ) : null}

      {editorStep === 2 ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-lg border border-border/80 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Mensagens</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ate 5 variantes. O envio escolhe uma aleatoriamente por contato.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy || draft.messages.length >= 5}
                onClick={() =>
                  onChangeDraft({
                    ...draft,
                    messages: [...draft.messages, createEmptyMessage()],
                  })
                }
              >
                <PlusIcon />
                Variante {draft.messages.length}/5
              </Button>
            </div>
            <div className="grid gap-3">
              {draft.messages.map((message, index) => (
                <MessageEditor
                  key={index}
                  index={index}
                  isBusy={isBusy}
                  message={message}
                  canRemove={draft.messages.length > 1}
                  onChange={(nextMessage) =>
                    onChangeDraft({
                      ...draft,
                      messages: draft.messages.map((item, itemIndex) =>
                        itemIndex === index ? nextMessage : item
                      ),
                    })
                  }
                  onRemove={() =>
                    onChangeDraft({
                      ...draft,
                      messages: draft.messages.filter(
                        (_, itemIndex) => itemIndex !== index
                      ),
                    })
                  }
                />
              ))}
            </div>
          </div>
          <PreviewPanel
            contact={previewContact}
            message={previewMessage}
            optOutText={draft.optOutText}
          />
        </div>
      ) : null}

      {editorStep === 3 ? (
        <div className="grid gap-3 rounded-lg border border-border/80 p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_minmax(0,1.35fr)]">
            <CalendarDateTimeField
              disabled={isBusy}
              label="Data e horario"
              value={draft.scheduledAt}
              onChange={(value) => onChangeDraft({ ...draft, scheduledAt: value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <SliderNumberField
                label="Intervalo minimo"
                min={15}
                max={600}
                step={5}
                suffix="s"
                value={draft.minDelaySeconds}
                disabled={isBusy}
                onChange={(value) =>
                  onChangeDraft({
                    ...draft,
                    maxDelaySeconds: Math.max(value, draft.maxDelaySeconds),
                    minDelaySeconds: value,
                  })
                }
              />
              <SliderNumberField
                label="Intervalo maximo"
                min={draft.minDelaySeconds}
                max={900}
                step={5}
                suffix="s"
                value={draft.maxDelaySeconds}
                disabled={isBusy}
                onChange={(value) =>
                  onChangeDraft({ ...draft, maxDelaySeconds: value })
                }
              />
              <SliderNumberField
                label="Limite diario"
                min={1}
                max={1000}
                step={1}
                value={draft.dailyLimit}
                disabled={isBusy}
                onChange={(value) => onChangeDraft({ ...draft, dailyLimit: value })}
              />
              <SliderNumberField
                label="Falhas para pausar"
                min={1}
                max={50}
                step={1}
                value={draft.safetyMaxErrors}
                disabled={isBusy}
                onChange={(value) =>
                  onChangeDraft({ ...draft, safetyMaxErrors: value })
                }
              />
            </div>
          </div>
          <RecurringScheduleField
            disabled={isBusy}
            recurrenceDays={draft.recurrenceDays}
            recurrenceTime={draft.recurrenceTime ?? ""}
            recurring={draft.recurring}
            onChange={(next) => onChangeDraft({ ...draft, ...next })}
          />
          <OptOutField
            disabled={isBusy}
            value={draft.optOutText}
            onChange={(optOutText) => onChangeDraft({ ...draft, optOutText })}
          />
        </div>
      ) : null}

      {editorStep === 4 ? (
        <CampaignReview
          draft={draft}
          estimatedAudience={estimatedAudience}
          instances={instances}
          previewContact={previewContact}
          previewMessage={previewMessage}
        />
      ) : null}
    </div>
  )
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-4">
      {[1, 2, 3, 4].map((step) => (
        <div
          key={step}
          className={cn(
            "rounded-md border border-border bg-card px-2.5 py-1.5 text-xs",
            step === currentStep && "border-primary bg-primary/10 text-primary"
          )}
        >
          <span className="font-semibold">Etapa {step}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {getEditorStepTitle(step)}
          </span>
        </div>
      ))}
    </div>
  )
}

function CampaignReview({
  draft,
  estimatedAudience,
  instances,
  previewContact,
  previewMessage,
}: {
  draft: WhatsAppCampaignInput
  estimatedAudience: EvolutionContact[]
  instances: ComboboxOption[]
  previewContact?: EvolutionContact
  previewMessage?: WhatsAppCampaignMessageDraft
}) {
  const selectedInstances = draft.selectedInstanceNames.length
    ? instances
        .filter((instance) => draft.selectedInstanceNames.includes(instance.value))
        .map((instance) => instance.label)
        .join(", ")
    : "Todas as instancias"
  const publicLabel =
    draft.audienceMode === "CUSTOM"
      ? `${draft.selectedContactIds.length} contatos selecionados`
      : draft.audienceMode === "FILTER"
        ? draft.includedLabels.length
          ? draft.includedLabels.join(", ")
          : "Nenhuma etiqueta selecionada"
        : "Todos os contatos"

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <div className="rounded-lg border border-border/80 p-4">
          <h2 className="text-sm font-semibold">Revisao</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <InfoTile label="Campanha" value={draft.name || "-"} />
            <InfoTile label="Publico" value={publicLabel} />
            <InfoTile label="Instancia" value={selectedInstances} />
            <InfoTile label="Contatos estimados" value={String(estimatedAudience.length)} />
            <InfoTile label="Variantes" value={`${draft.messages.length}/5`} />
            <InfoTile
              label="Agendamento"
              value={draft.scheduledAt ? formatDateTime(draft.scheduledAt) : "Enviar agora"}
            />
            <InfoTile
              label="Intervalo"
              value={`${draft.minDelaySeconds}s a ${draft.maxDelaySeconds}s`}
            />
            <InfoTile
              label="Recorrencia"
              value={
                draft.recurring
                  ? `${draft.recurrenceDays.length || 7} dias, ${draft.recurrenceTime || "09:00"}`
                  : "Nao repetir"
              }
            />
          </div>
        </div>
        <div className="rounded-lg border border-border/80 p-4">
          <h2 className="text-sm font-semibold">Variantes configuradas</h2>
          <div className="mt-3 grid gap-2">
            {draft.messages.map((message, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-3 text-sm"
              >
                <span>Variante {index + 1}</span>
                <span className="text-xs text-muted-foreground">
                  {translateMessageType(message.type)}
                  {message.type !== "TEXT" && message.textAfterMedia
                    ? " + texto separado"
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <PreviewPanel
        contact={previewContact}
        message={previewMessage}
        optOutText={draft.optOutText}
      />
    </div>
  )
}

function MessageEditor({
  canRemove,
  index,
  isBusy,
  message,
  onChange,
  onRemove,
}: {
  canRemove: boolean
  index: number
  isBusy: boolean
  message: WhatsAppCampaignMessageDraft
  onChange: (message: WhatsAppCampaignMessageDraft) => void
  onRemove: () => void
}) {
  const selectedType = MESSAGE_TYPES.find((item) => item.value === message.type)
  const SelectedTypeIcon = selectedType?.icon
  const attachments = getMessageAttachments(message)
  const hasReachedAttachmentLimit = attachments.length >= MAX_MEDIA_ATTACHMENTS

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])

    if (!files.length) {
      return
    }

    const remainingSlots = MAX_MEDIA_ATTACHMENTS - attachments.length

    if (remainingSlots <= 0) {
      toast.info(`Limite de ${MAX_MEDIA_ATTACHMENTS} arquivos por variante.`)
      return
    }

    const selectedFiles = files.slice(0, remainingSlots)

    if (files.length > remainingSlots) {
      toast.info(
        `Foram adicionados somente ${remainingSlots} arquivos. O limite e ${MAX_MEDIA_ATTACHMENTS}.`
      )
    }

    const uploadedAttachments = await Promise.all(
      selectedFiles.map(async (file, fileIndex) => ({
        fileName:
          file.name ||
          getFallbackFileName(message.type, attachments.length + fileIndex),
        media: await fileToDataUrl(file),
        mimetype: file.type || getDefaultMimeType(message.type),
      }))
    )
    const nextAttachments = [...attachments, ...uploadedAttachments]
    const firstAttachment = nextAttachments[0]

    onChange({
      ...message,
      attachments: nextAttachments,
      fileName: firstAttachment?.fileName,
      media: firstAttachment?.media,
      mimetype: firstAttachment?.mimetype,
    })
  }

  function removeAttachment(indexToRemove: number) {
    const nextAttachments = attachments.filter(
      (_, attachmentIndex) => attachmentIndex !== indexToRemove
    )
    const firstAttachment = nextAttachments[0]

    onChange({
      ...message,
      attachments: nextAttachments,
      fileName: firstAttachment?.fileName,
      media: firstAttachment?.media,
      mimetype: firstAttachment?.mimetype,
    })
  }

  return (
    <div className="rounded-lg border border-border/80 bg-card/50 p-2.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {SelectedTypeIcon ? <SelectedTypeIcon className="size-4" /> : null}
          Variante {index + 1}
        </div>
        <div className="flex items-center gap-2">
          <ComboboxSelect
            value={message.type}
            disabled={isBusy}
            options={MESSAGE_TYPES.map((item) => ({
              label: item.label,
              value: item.value,
            }))}
            onChange={(value) => {
              const nextType = value as WhatsAppCampaignMessageTypeCode
              const shouldKeepAttachments = nextType === message.type

              onChange({
                ...message,
                attachments: shouldKeepAttachments ? attachments : [],
                fileName: shouldKeepAttachments ? message.fileName : undefined,
                media: shouldKeepAttachments ? message.media : undefined,
                mimetype: shouldKeepAttachments ? message.mimetype : undefined,
                textAfterMedia: nextType === "TEXT" ? false : message.textAfterMedia,
                type: nextType,
              })
            }}
          />
          {canRemove ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={isBusy}
              onClick={onRemove}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2.5">
        {message.type !== "TEXT" ? (
          <div className="grid gap-1.5">
            <Label>Modo de envio</Label>
            <ComboboxSelect
              value={message.textAfterMedia ? "after" : "caption"}
              disabled={isBusy}
              options={[
                { label: "Texto junto com a midia", value: "caption" },
                { label: "Midia primeiro e texto depois", value: "after" },
              ]}
              onChange={(value) =>
                onChange({
                  ...message,
                  textAfterMedia: value === "after",
                })
              }
            />
          </div>
        ) : null}
        <Label>
          {message.type === "TEXT"
            ? "Texto"
            : message.textAfterMedia
              ? "Texto enviado depois da midia"
              : "Texto junto da midia"}
        </Label>
        <Textarea
          value={message.text}
          placeholder={
            message.type === "TEXT"
              ? "Texto com {nome}"
              : "Opcional. Deixe vazio para enviar apenas a midia."
          }
          rows={5}
          disabled={isBusy}
          className="max-h-32 min-h-[112px] overflow-y-auto resize-y"
          onChange={(event) => onChange({ ...message, text: event.target.value })}
        />
        {message.type !== "TEXT" ? (
          <div className="grid gap-2">
            <Label>Arquivos</Label>
            <label
              className={cn(
                "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-4 text-center text-sm transition hover:bg-muted/40",
                (isBusy || hasReachedAttachmentLimit) &&
                  "cursor-not-allowed opacity-60 hover:bg-background"
              )}
            >
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
                <UploadIcon className="size-4" />
              </span>
              <span className="font-medium">
                {hasReachedAttachmentLimit
                  ? "Limite de arquivos atingido"
                  : "Enviar arquivos"}
              </span>
              <span className="text-xs text-muted-foreground">
                {attachments.length}/{MAX_MEDIA_ATTACHMENTS} selecionados
              </span>
              <input
                type="file"
                className="sr-only"
                disabled={isBusy || hasReachedAttachmentLimit}
                accept={getAccept(message.type)}
                multiple
                onChange={(event) => {
                  void handleFiles(event.target.files)
                  event.currentTarget.value = ""
                }}
              />
            </label>
            {attachments.length ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {attachments.map((attachment, attachmentIndex) => (
                  <div
                    key={`${attachment.media.slice(0, 28)}-${attachmentIndex}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <MediaTypeIcon type={message.type} />
                      <span className="truncate">
                        {translateMessageType(message.type)} {attachmentIndex + 1}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => removeAttachment(attachmentIndex)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CalendarDateTimeField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean
  label: string
  onChange: (value: string | null) => void
  value?: string | null
}) {
  const date = value ? new Date(value) : undefined
  const timeValue = date ? toTimeValue(date) : "09:00"

  function updateDate(nextDate?: Date) {
    if (!nextDate) {
      onChange(null)
      return
    }

    const [hours, minutes] = timeValue.split(":").map((part) => Number(part))
    const merged = new Date(nextDate)
    merged.setHours(hours || 0, minutes || 0, 0, 0)
    onChange(merged.toISOString())
  }

  function updateTime(nextTime: string) {
    const nextDate = date ?? new Date()
    const [hours, minutes] = nextTime.split(":").map((part) => Number(part))
    const merged = new Date(nextDate)
    merged.setHours(hours || 0, minutes || 0, 0, 0)
    onChange(merged.toISOString())
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border/80 bg-card/40 p-3">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className="min-w-0 justify-start text-left font-normal"
              />
            }
          >
            <CalendarIcon className="shrink-0" />
            <span className="min-w-0 truncate">
              {date ? formatDateOnly(date) : "Selecionar data"}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              selected={date}
              onSelect={updateDate}
              disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
            />
          </PopoverContent>
        </Popover>
        <ComboboxSelect
          value={timeValue}
          disabled={disabled}
          options={getTimeOptions()}
          onChange={updateTime}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || !date}
        className="h-7 justify-self-start px-2 text-xs text-muted-foreground"
        onClick={() => onChange(null)}
      >
        Enviar agora
      </Button>
    </div>
  )
}

function SliderNumberField({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  suffix = "",
  value,
}: {
  disabled?: boolean
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  suffix?: string
  value: number
}) {
  const safeValue = Math.min(Math.max(value, min), max)

  return (
    <div className="grid gap-2 rounded-lg border border-border/80 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
          {safeValue}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        disabled={disabled}
        className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  )
}

function RecurringScheduleField({
  disabled,
  onChange,
  recurrenceDays,
  recurrenceTime,
  recurring,
}: {
  disabled: boolean
  onChange: (
    value: Partial<
      Pick<
        WhatsAppCampaignInput,
        "recurrenceDays" | "recurrenceTime" | "recurring"
      >
    >
  ) => void
  recurrenceDays: string[]
  recurrenceTime: string
  recurring: boolean
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border/80 bg-card/40 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={recurring}
          disabled={disabled}
          onChange={(event) => onChange({ recurring: event.target.checked })}
        />
        Repetir campanha
      </label>

      {recurring ? (
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="grid gap-1.5">
            <Label>Horario recorrente</Label>
            <ComboboxSelect
              disabled={disabled}
              value={recurrenceTime || "09:00"}
              options={getTimeOptions()}
              onChange={(recurrenceTime) => onChange({ recurrenceTime })}
            />
          </div>
          <WeekdaySelector
            disabled={disabled}
            selectedValues={recurrenceDays}
            onToggle={(value) =>
              onChange({
                recurrenceDays: toggleValue(recurrenceDays, value),
              })
            }
          />
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          A campanha sera enviada apenas uma vez.
        </div>
      )}
    </div>
  )
}

function WeekdaySelector({
  disabled,
  onToggle,
  selectedValues,
}: {
  disabled: boolean
  onToggle: (value: string) => void
  selectedValues: string[]
}) {
  return (
    <div className="grid gap-1.5">
      <Label>Dias</Label>
      <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-background p-1.5">
        {WEEKDAYS.map((day) => {
          const isSelected = selectedValues.includes(day.value)

          return (
            <button
              key={day.value}
              type="button"
              disabled={disabled}
              className={cn(
                "h-8 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted/70"
              )}
              onClick={() => onToggle(day.value)}
            >
              {day.label}
            </button>
          )
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {selectedValues.length
          ? `${selectedValues.length} dias selecionados`
          : "Todos os dias"}
      </span>
    </div>
  )
}

function OptOutField({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean
  onChange: (value: string) => void
  value: string
}) {
  const isEnabled = Boolean(value.trim())

  return (
    <div className="grid gap-2 rounded-lg border border-border/80 bg-card/40 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={isEnabled}
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.checked ? DEFAULT_OPT_OUT : "")
          }
        />
        Mensagem de descadastro
      </label>
      {isEnabled ? (
        <Input
          value={value}
          disabled={disabled}
          placeholder={DEFAULT_OPT_OUT}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <div className="text-xs text-muted-foreground">
          Opcional. Ative somente se quiser incluir uma frase de descadastro.
        </div>
      )}
    </div>
  )
}

function CampaignResults({ campaign }: { campaign: WhatsAppCampaignItem }) {
  return (
    <div className="grid gap-4 rounded-lg border border-border/80 p-4 xl:grid-cols-2">
      <div>
        <h2 className="mb-3 text-sm font-semibold">Fila</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <ResultMetric label="Pendentes" value={campaign.jobSummary.pending} />
          <ResultMetric label="Enviados" value={campaign.jobSummary.sent} />
          <ResultMetric label="Falhas" value={campaign.jobSummary.failed} />
        </div>
        <div className="mt-3 max-h-72 overflow-auto rounded-md border border-border/70">
          {campaign.jobs.length ? (
            campaign.jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{job.contactName}</div>
                  <div className="text-xs text-muted-foreground">
                    {job.instanceDisplayName}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {translateJobStatus(job.status)}
                </span>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma fila preparada.
            </div>
          )}
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold">Eventos</h2>
        <div className="max-h-96 overflow-auto rounded-md border border-border/70">
          {campaign.events.length ? (
            campaign.events.map((event) => (
              <div
                key={event.id}
                className="border-b border-border/60 px-3 py-2 text-sm last:border-b-0"
              >
                <div>{event.message}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum evento registrado.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewPanel({
  contact,
  message,
  optOutText,
}: {
  contact?: EvolutionContact
  message?: WhatsAppCampaignMessageDraft
  optOutText: string
}) {
  const text = message
    ? renderText(message.text, contact, optOutText)
    : "Sua mensagem aparece aqui."
  const attachments = message ? getMessageAttachments(message) : []
  const hasMedia = Boolean(attachments.length && message?.type !== "TEXT")
  const shouldShowText = Boolean(message?.text?.trim() || message?.type === "TEXT")

  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
      <div className="mb-3 text-sm font-semibold">Preview</div>
      <div className="max-h-[420px] overflow-y-auto rounded-lg bg-background p-3">
        {hasMedia ? (
          <div className="mb-3 rounded-md bg-primary/15 p-2">
            <div className="grid gap-2">
              {attachments.map((attachment, index) => (
                <MediaPreview
                  key={`${attachment.media.slice(0, 28)}-${index}`}
                  attachment={attachment}
                  index={index}
                  message={message}
                />
              ))}
            </div>
            {!message?.textAfterMedia && shouldShowText ? (
              <div className="mt-2 whitespace-pre-wrap text-sm">{text}</div>
            ) : null}
          </div>
        ) : null}
        {(!hasMedia || message?.textAfterMedia) && shouldShowText ? (
          <div className="rounded-md bg-primary/15 p-3 text-sm whitespace-pre-wrap">
            {text}
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {contact ? contact.name : "Sem contato selecionado"}
      </div>
    </div>
  )
}

function MediaPreview({
  attachment,
  index,
  message,
}: {
  attachment?: WhatsAppCampaignMediaDraft
  index?: number
  message?: WhatsAppCampaignMessageDraft
}) {
  const source = attachment?.media?.trim()

  if (!source) {
    return (
      <div className="flex h-36 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
        {MESSAGE_TYPES.find((item) => item.value === message?.type)?.label}
      </div>
    )
  }

  if (message?.type === "IMAGE") {
    return (
      <div
        aria-label={`Preview da imagem ${(index ?? 0) + 1}`}
        role="img"
        className="h-52 w-full rounded-md bg-muted bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${source})` }}
      />
    )
  }

  if (message?.type === "VIDEO") {
    return (
      <video
        src={source}
        controls
        className="max-h-52 w-full rounded-md bg-muted"
      />
    )
  }

  return (
    <div className="flex min-h-28 items-center gap-3 rounded-md bg-muted p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        <FileIcon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          Documento {(index ?? 0) + 1}
        </div>
      </div>
    </div>
  )
}

function InstanceSelect({
  disabled,
  instances,
  onChange,
  selectedValues,
}: {
  disabled: boolean
  instances: ComboboxOption[]
  onChange: (values: string[]) => void
  selectedValues: string[]
}) {
  const options = [
    {
      label: "Todas as instancias conectadas",
      value: ALL_INSTANCES_VALUE,
    },
    ...(selectedValues.length > 1
      ? [
          {
            label: `${selectedValues.length} instancias selecionadas`,
            value: MULTIPLE_INSTANCES_VALUE,
          },
        ]
      : []),
    ...instances,
  ]
  const value =
    selectedValues.length === 1
      ? selectedValues[0]
      : selectedValues.length > 1
        ? MULTIPLE_INSTANCES_VALUE
        : ALL_INSTANCES_VALUE

  return (
    <div className="grid gap-2">
      <Label>Instancia de envio</Label>
      <ComboboxSelect
        disabled={disabled}
        options={options}
        value={value}
        onChange={(nextValue) => {
          if (nextValue === ALL_INSTANCES_VALUE) {
            onChange([])
            return
          }

          if (nextValue === MULTIPLE_INSTANCES_VALUE) {
            return
          }

          onChange([nextValue])
        }}
      />
    </div>
  )
}

function ContactSelectionBox({
  contactQuery,
  contacts,
  disabled,
  onChangeContactQuery,
  onSetSelectedContactIds,
  onToggleContact,
  selectedContactIds,
}: {
  contactQuery: string
  contacts: EvolutionContact[]
  disabled: boolean
  onChangeContactQuery: (value: string) => void
  onSetSelectedContactIds: (contactIds: string[]) => void
  onToggleContact: (contactId: string) => void
  selectedContactIds: string[]
}) {
  const selectedSet = React.useMemo(
    () => new Set(selectedContactIds),
    [selectedContactIds]
  )
  const visibleContactIds = React.useMemo(
    () => contacts.map((contact) => contact.id),
    [contacts]
  )
  const areAllVisibleSelected =
    visibleContactIds.length > 0 &&
    visibleContactIds.every((contactId) => selectedSet.has(contactId))

  function toggleVisibleContacts() {
    if (areAllVisibleSelected) {
      const visibleSet = new Set(visibleContactIds)

      onSetSelectedContactIds(
        selectedContactIds.filter((contactId) => !visibleSet.has(contactId))
      )
      return
    }

    onSetSelectedContactIds([...new Set([...selectedContactIds, ...visibleContactIds])])
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border/80 p-4">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
        <Input
          value={contactQuery}
          disabled={disabled}
          placeholder="Pesquisar contato"
          onChange={(event) => onChangeContactQuery(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !contacts.length}
          onClick={toggleVisibleContacts}
        >
          {areAllVisibleSelected ? "Desselecionar lista" : "Selecionar lista"}
        </Button>
      </div>
      <div className="h-[min(38vh,340px)] overflow-y-auto overscroll-contain rounded-md border border-border/70">
        {contacts.length ? (
          contacts.map((contact) => {
            const isSelected = selectedSet.has(contact.id)

            return (
              <label
                key={contact.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40",
                  isSelected && "bg-muted/30",
                  disabled && "cursor-not-allowed opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onToggleContact(contact.id)}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {contact.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {contact.formattedNumber}
                </span>
              </label>
            )
          })
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Nenhum contato encontrado.
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {selectedContactIds.length} contatos selecionados
      </div>
    </div>
  )
}

function CheckboxSelectionBox({
  disabled,
  emptyLabel,
  label,
  onToggle,
  options,
  selectedValues,
}: {
  disabled: boolean
  emptyLabel: string
  label: string
  onToggle: (value: string) => void
  options: ComboboxOption[]
  selectedValues: string[]
}) {
  const [query, setQuery] = React.useState("")
  const selectedSet = React.useMemo(
    () => new Set(selectedValues),
    [selectedValues]
  )
  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = normalizeText(query)

    if (!normalizedQuery) {
      return options
    }

    return options.filter((option) =>
      normalizeText(option.label).includes(normalizedQuery)
    )
  }, [options, query])

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="grid gap-2 rounded-lg border border-border/80 p-3">
        <Input
          value={query}
          disabled={disabled || !options.length}
          placeholder={`Pesquisar ${label.toLowerCase()}`}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-56 overflow-y-auto overscroll-contain rounded-md border border-border/70">
          {filteredOptions.length ? (
            filteredOptions.map((option) => {
              const isSelected = selectedSet.has(option.value)

              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40",
                    isSelected && "bg-muted/30",
                    disabled && "cursor-not-allowed opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => onToggle(option.value)}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </label>
              )
            })
          ) : (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {selectedValues.length} selecionadas
        </div>
      </div>
    </div>
  )
}

function ComboboxSelect({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean
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
      disabled={disabled}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
      onValueChange={(nextOption) => {
        if (nextOption) {
          onChange(nextOption.value)
        }
      }}
    >
      <ComboboxInput disabled={disabled} className="w-full bg-background" />
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

function MetricPill({
  icon: Icon,
  label,
}: {
  icon: LucideIcon
  label: string
}) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2">
      <Icon className="size-3.5" />
      {label}
    </span>
  )
}

function ResultMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-xs",
        status === "RUNNING" && "border-primary/40 bg-primary/10 text-primary",
        status === "SCHEDULED" && "border-sky-400/40 bg-sky-500/10 text-sky-300",
        status === "PAUSED" && "border-amber-300/40 bg-amber-500/10 text-amber-300",
        status === "COMPLETED" && "border-primary/40 bg-primary/10 text-primary",
        (status === "FAILED" || status === "CANCELED") &&
          "border-destructive/40 bg-destructive/10 text-destructive",
        status === "DRAFT" && "border-border bg-muted text-muted-foreground"
      )}
    >
      {translateCampaignStatus(status)}
    </span>
  )
}

function createEmptyDraft(): WhatsAppCampaignInput {
  return {
    audienceMode: "ALL",
    dailyLimit: 120,
    excludedLabels: [],
    includedLabels: [],
    maxDelaySeconds: 120,
    messages: [createEmptyMessage()],
    minDelaySeconds: 45,
    name: "Nova campanha",
    optOutText: "",
    recurrenceDays: [],
    recurrenceTime: "",
    recurring: false,
    safetyMaxErrors: 10,
    scheduledAt: null,
    selectedContactIds: [],
    selectedInstanceNames: [],
    timezone: "America/Sao_Paulo",
  }
}

function createEmptyMessage(): WhatsAppCampaignMessageDraft {
  return {
    attachments: [],
    text: "Ola {nome}, tudo bem?",
    textAfterMedia: false,
    type: "TEXT",
  }
}

function campaignToInput(campaign: WhatsAppCampaignItem): WhatsAppCampaignInput {
  return {
    audienceMode: campaign.audienceMode,
    dailyLimit: campaign.dailyLimit,
    excludedLabels: campaign.excludedLabels,
    id: campaign.id,
    includedLabels: campaign.includedLabels,
    maxDelaySeconds: campaign.maxDelaySeconds,
    messages: campaign.messages.length
      ? campaign.messages
          .slice(0, 5)
          .map((message) => ({
            ...message,
            attachments: getMessageAttachments(message),
            textAfterMedia: message.textAfterMedia ?? false,
          }))
      : [createEmptyMessage()],
    minDelaySeconds: campaign.minDelaySeconds,
    name: campaign.name,
    optOutText: campaign.optOutText,
    recurrenceDays: campaign.recurrenceDays,
    recurrenceTime: campaign.recurrenceTime ?? "",
    recurring: campaign.recurring,
    safetyMaxErrors: campaign.safetyMaxErrors,
    scheduledAt: campaign.scheduledAt,
    selectedContactIds: campaign.selectedContactIds,
    selectedInstanceNames: campaign.selectedInstanceNames,
    timezone: campaign.timezone,
  }
}

function selectDraftAudience(
  draft: WhatsAppCampaignInput,
  contacts: EvolutionContact[]
) {
  const selectedInstances = new Set(draft.selectedInstanceNames)
  const includedLabels = new Set(draft.includedLabels)
  const excludedLabels = new Set(draft.excludedLabels)
  const selectedContacts = new Set(draft.selectedContactIds)

  return contacts.filter((contact) => {
    if (selectedInstances.size && !selectedInstances.has(contact.instanceName)) {
      return false
    }

    if (draft.audienceMode === "CUSTOM" && !selectedContacts.has(contact.id)) {
      return false
    }

    if (draft.audienceMode === "FILTER" && !includedLabels.size) {
      return false
    }

    if (
      draft.audienceMode === "FILTER" &&
      includedLabels.size &&
      !contact.labels.some((label) => includedLabels.has(label))
    ) {
      return false
    }

    if (contact.labels.some((label) => excludedLabels.has(label))) {
      return false
    }

    return true
  })
}

function renderText(
  text: string,
  contact: EvolutionContact | undefined,
  optOutText: string
) {
  const rendered = text
    .replace(/\{nome\}/gi, contact?.name ?? "Nome")
    .replace(/\{name\}/gi, contact?.name ?? "Nome")
    .replace(/\{numero\}/gi, contact?.number ?? "554599999999")
    .replace(/\{number\}/gi, contact?.number ?? "554599999999")

  return optOutText.trim() ? `${rendered}\n\n${optOutText.trim()}` : rendered
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function formatDateOnly(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(value)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(new Date(value))
    .replace(",", "")
}

function toTimeValue(value: Date) {
  return `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes()
  ).padStart(2, "0")}`
}

function getTimeOptions() {
  const options: ComboboxOption[] = []

  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 15, 30, 45]) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
        2,
        "0"
      )}`

      options.push({ label: value, value })
    }
  }

  return options
}

function getEditorStepTitle(step: number) {
  const labels: Record<number, string> = {
    1: "Publico e instancia",
    2: "Mensagem e preview",
    3: "Datas e intervalos",
    4: "Revisao",
  }

  return labels[step] ?? "Configuracao"
}

function translateMessageType(type: WhatsAppCampaignMessageTypeCode) {
  const option = MESSAGE_TYPES.find((item) => item.value === type)

  return option?.label ?? type
}

function MediaTypeIcon({
  type,
}: {
  type: WhatsAppCampaignMessageTypeCode
}) {
  const item = MESSAGE_TYPES.find((messageType) => messageType.value === type)
  const Icon = item?.icon ?? FileIcon

  return <Icon className="size-4 shrink-0 text-muted-foreground" />
}

function translateCampaignStatus(status: string) {
  const labels: Record<string, string> = {
    CANCELED: "Cancelada",
    COMPLETED: "Concluida",
    DRAFT: "Rascunho",
    FAILED: "Falha",
    PAUSED: "Pausada",
    RUNNING: "Rodando",
    SCHEDULED: "Agendada",
  }

  return labels[status] ?? status
}

function translateJobStatus(status: string) {
  const labels: Record<string, string> = {
    CANCELED: "Cancelado",
    FAILED: "Falha",
    PENDING: "Pendente",
    SENDING: "Enviando",
    SENT: "Enviado",
    SKIPPED: "Ignorado",
  }

  return labels[status] ?? status
}

function getCampaignMetrics(campaign: WhatsAppCampaignItem) {
  const total = campaign.jobSummary.total
  const completed =
    campaign.jobSummary.sent +
    campaign.jobSummary.failed +
    campaign.jobSummary.skipped +
    campaign.jobSummary.canceled
  const progress = total ? Math.round((completed / total) * 100) : 0
  const sortedJobDates = campaign.jobs
    .map((job) => job.sentAt ?? job.scheduledAt)
    .filter(Boolean)
    .sort()
  const estimatedEnd =
    sortedJobDates.at(-1) ??
    estimateCampaignEnd(campaign, total ? total : campaign.selectedContactIds.length)

  return {
    contacts: total,
    estimatedEnd,
    failed: campaign.jobSummary.failed,
    progress,
    progressLabel: total ? `${completed}/${total}` : "Sem fila preparada",
    read: campaign.jobSummary.read,
    sent: campaign.jobSummary.sent,
    startedAt:
      campaign.startedAt ??
      campaign.preparedAt ??
      campaign.scheduledAt ??
      campaign.createdAt,
  }
}

function estimateCampaignEnd(campaign: WhatsAppCampaignItem, contacts: number) {
  if (!campaign.scheduledAt || !contacts) {
    return null
  }

  const averageDelay =
    (campaign.minDelaySeconds + campaign.maxDelaySeconds) / 2
  const totalSeconds = Math.max(0, contacts - 1) * averageDelay

  return new Date(
    new Date(campaign.scheduledAt).getTime() + totalSeconds * 1000
  ).toISOString()
}

function showActionToast(
  action: CampaignAction,
  result: WhatsAppCampaignActionResult
) {
  if (action === "prepare" && result.prepared) {
    toast.success(`${result.prepared.total} contatos entraram na fila.`)
    return
  }

  if (action === "process" && result.processed) {
    toast.success(
      `${result.processed.sent} enviados, ${result.processed.failed} falhas.`
    )
    return
  }

  const labels: Record<CampaignAction, string> = {
    cancel: "Campanha cancelada.",
    delete: "Campanha excluida.",
    pause: "Campanha pausada.",
    prepare: "Campanha preparada.",
    process: "Fila processada.",
    resume: "Campanha retomada.",
    save: "Campanha salva.",
  }

  toast.success(labels[action])
}

async function getCampaignSnapshot() {
  const response = await fetch("/api/whatsapp-campaigns", {
    cache: "no-store",
  })

  return parseApiResponse<WhatsAppCampaignSnapshot>(response)
}

async function postCampaignAction(input: {
  action: CampaignAction
  campaignId?: string
  input?: WhatsAppCampaignInput
}) {
  const response = await fetch("/api/whatsapp-campaigns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return parseApiResponse<WhatsAppCampaignActionResult>(response)
}

async function parseApiResponse<T>(response: Response) {
  const data = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "Nao foi possivel processar campanhas."

    throw new Error(
      message
    )
  }

  return data as T
}

function getRequestErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel processar campanhas."
}

function getAccept(type: WhatsAppCampaignMessageTypeCode) {
  if (type === "IMAGE") {
    return "image/*"
  }

  if (type === "VIDEO") {
    return "video/*"
  }

  return ".pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf"
}

function getMessageAttachments(
  message?: WhatsAppCampaignMessageDraft
): WhatsAppCampaignMediaDraft[] {
  if (!message || message.type === "TEXT") {
    return []
  }

  if (Array.isArray(message.attachments) && message.attachments.length) {
    return message.attachments
      .filter((attachment) => attachment.media?.trim())
      .slice(0, MAX_MEDIA_ATTACHMENTS)
  }

  if (!message.media?.trim()) {
    return []
  }

  return [
    {
      fileName: message.fileName || getFallbackFileName(message.type, 0),
      media: message.media,
      mimetype: message.mimetype || getDefaultMimeType(message.type),
    },
  ]
}

function getDefaultMimeType(type: WhatsAppCampaignMessageTypeCode) {
  if (type === "IMAGE") {
    return "image/jpeg"
  }

  if (type === "VIDEO") {
    return "video/mp4"
  }

  if (type === "DOCUMENT") {
    return "application/pdf"
  }

  return ""
}

function getFallbackFileName(
  type: WhatsAppCampaignMessageTypeCode,
  index: number
) {
  const number = index + 1

  if (type === "IMAGE") {
    return `imagem-${number}.jpg`
  }

  if (type === "VIDEO") {
    return `video-${number}.mp4`
  }

  return `documento-${number}.pdf`
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => resolve(String(reader.result ?? "")))
    reader.addEventListener("error", () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}
