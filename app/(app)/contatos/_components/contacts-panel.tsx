"use client"

import * as React from "react"
import {
  BanIcon,
  CheckIcon,
  ChevronRightIcon,
  ContactIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileSpreadsheetIcon,
  FlagIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SmartphoneIcon,
  TagIcon,
  UploadIcon,
  XCircleIcon,
  type LucideIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  CONTACT_IMPORT_EXAMPLE,
  type EvolutionContact,
  type EvolutionContactImportResult,
  type EvolutionContactImportRow,
  type EvolutionContactInstance,
  type EvolutionContactsSnapshot,
} from "@/lib/evolution-contacts-types"

type ContactAction =
  | "add"
  | "import"
  | "set-blocked"
  | "set-labels"
  | "set-reported"
  | "update"

type ContactActionResponse = {
  snapshot: EvolutionContactsSnapshot
  importResult?: EvolutionContactImportResult
}

type ContactDraft = {
  instanceName: string
  name: string
  number: string
  labels: string[]
}

type ModalState =
  | { type: "add" }
  | { type: "edit"; contact: EvolutionContact }
  | { type: "export" }
  | { type: "import" }
  | { type: "labels"; contact: EvolutionContact }
  | null

const EMPTY_DRAFT: ContactDraft = {
  instanceName: "",
  name: "",
  number: "",
  labels: [],
}
const CONTACTS_PAGE_SIZE = 50

export function ContactsPanel() {
  const [snapshot, setSnapshot] =
    React.useState<EvolutionContactsSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [busyContact, setBusyContact] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [instanceFilter, setInstanceFilter] = React.useState("all")
  const [labelFilter, setLabelFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [modal, setModal] = React.useState<ModalState>(null)
  const [draft, setDraft] = React.useState<ContactDraft>(EMPTY_DRAFT)
  const [newLabel, setNewLabel] = React.useState("")
  const [importRows, setImportRows] = React.useState<EvolutionContactImportRow[]>(
    []
  )
  const [importFileName, setImportFileName] = React.useState("")
  const [importResult, setImportResult] =
    React.useState<EvolutionContactImportResult | null>(null)
  const [exportInstance, setExportInstance] = React.useState("all")

  const fetchContacts = React.useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setIsSyncing(true)
      }

      try {
        const next = await fetchContactsSnapshot()

        setSnapshot(next)
        setDraft((current) => ({
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
    },
    []
  )

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchContacts()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [fetchContacts])

  const filteredContacts = React.useMemo(() => {
    if (!snapshot) {
      return []
    }

    const normalizedQuery = normalizeText(query)
    const numberQuery = query.replace(/\D/g, "")

    return snapshot.contacts.filter((contact) => {
      const contactNumber = contact.number.replace(/\D/g, "")
      const formattedNumber = contact.formattedNumber.replace(/\D/g, "")
      const matchesQuery =
        (!normalizedQuery && !numberQuery) ||
        (normalizedQuery
          ? normalizeText(contact.name).includes(normalizedQuery)
          : false) ||
        (numberQuery
          ? contactNumber.includes(numberQuery) ||
            formattedNumber.includes(numberQuery)
          : false)
      const matchesInstance =
        instanceFilter === "all" || contact.instanceName === instanceFilter
      const matchesLabel =
        labelFilter === "all" || contact.labels.includes(labelFilter)
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "blocked" && contact.blocked) ||
        (statusFilter === "reported" && contact.reported) ||
        (statusFilter === "manual" && contact.source !== "evolution")

      return matchesQuery && matchesInstance && matchesLabel && matchesStatus
    })
  }, [instanceFilter, labelFilter, query, snapshot, statusFilter])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredContacts.length / CONTACTS_PAGE_SIZE)
  )
  const activePage = Math.min(currentPage, totalPages)
  const paginatedContacts = React.useMemo(() => {
    const start = (activePage - 1) * CONTACTS_PAGE_SIZE

    return filteredContacts.slice(start, start + CONTACTS_PAGE_SIZE)
  }, [activePage, filteredContacts])
  const paginationStart = filteredContacts.length
    ? (activePage - 1) * CONTACTS_PAGE_SIZE + 1
    : 0
  const paginationEnd = Math.min(
    activePage * CONTACTS_PAGE_SIZE,
    filteredContacts.length
  )

  function resetContactPagination() {
    setCurrentPage(1)
  }

  function openAddModal() {
    setDraft({
      ...EMPTY_DRAFT,
      instanceName: snapshot?.instances[0]?.instanceName ?? "",
    })
    setNewLabel("")
    setModal({ type: "add" })
  }

  function openEditModal(contact: EvolutionContact) {
    setDraft({
      instanceName: contact.instanceName,
      name: contact.name,
      number: contact.number,
      labels: contact.labels,
    })
    setNewLabel("")
    setModal({ type: "edit", contact })
  }

  function openLabelsModal(contact: EvolutionContact) {
    setDraft({
      instanceName: contact.instanceName,
      name: contact.name,
      number: contact.number,
      labels: contact.labels,
    })
    setNewLabel("")
    setModal({ type: "labels", contact })
  }

  function openImportModal() {
    setImportRows([])
    setImportFileName("")
    setImportResult(null)
    setExportInstance(snapshot?.instances[0]?.instanceName ?? "")
    setModal({ type: "import" })
  }

  function openExportModal() {
    setExportInstance("all")
    setModal({ type: "export" })
  }

  async function handleSubmitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!modal || (modal.type !== "add" && modal.type !== "edit")) {
      return
    }

    const action = modal.type === "add" ? "add" : "update"
    const result = await runContactAction({
      action,
      contactId: modal.type === "edit" ? modal.contact.id : undefined,
      instanceName: draft.instanceName,
      name: draft.name,
      number: draft.number,
      labels: draft.labels,
    })

    if (result) {
      setModal(null)
      toast.success(
        modal.type === "add" ? "Contato adicionado." : "Contato atualizado."
      )
    }
  }

  async function handleSubmitLabels(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!modal || modal.type !== "labels") {
      return
    }

    const result = await runContactAction({
      action: "set-labels",
      contactId: modal.contact.id,
      labels: draft.labels,
    })

    if (result) {
      setModal(null)
      toast.success("Etiquetas atualizadas.")
    }
  }

  async function handleFlagContact(
    contact: EvolutionContact,
    action: "set-blocked" | "set-reported",
    value: boolean
  ) {
    setBusyContact(contact.id)

    const result = await runContactAction({
      action,
      contactId: contact.id,
      value,
    })

    setBusyContact(null)

    if (result) {
      toast.success(value ? "Contato marcado." : "Marcacao removida.")
    }
  }

  async function handleImportContacts(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!importRows.length) {
      toast.warning("Selecione uma planilha CSV para importar.")
      return
    }

    const result = await runContactAction({
      action: "import",
      fallbackInstanceName: exportInstance,
      rows: importRows,
    })

    if (result?.importResult) {
      setImportResult(result.importResult)
      toast.success(
        `${result.importResult.added} adicionados, ${result.importResult.discarded} descartados.`
      )
    }
  }

  function handleExportContacts(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!snapshot) {
      return
    }

    const contacts =
      exportInstance === "all"
        ? snapshot.contacts
        : snapshot.contacts.filter((contact) => contact.instanceName === exportInstance)

    if (!contacts.length) {
      toast.warning("Nenhum contato para exportar.")
      return
    }

    downloadCsv("contatos-nexawise.csv", contactsToCsv(contacts))
    setModal(null)
    toast.success("Contatos exportados.")
  }

  async function runContactAction(
    payload: {
      action: ContactAction
      contactId?: string
      fallbackInstanceName?: string
      instanceName?: string
      labels?: string[]
      name?: string
      number?: string
      rows?: EvolutionContactImportRow[]
      value?: boolean
    }
  ) {
    setIsSyncing(true)

    try {
      const result = await postContactAction({
        ...payload,
      })

      setSnapshot(result.snapshot)
      return result
    } catch (error) {
      toast.error(getRequestErrorMessage(error))
      return null
    } finally {
      setIsSyncing(false)
      setIsLoading(false)
    }
  }

  if (isLoading && !snapshot) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          Sincronizando contatos...
        </div>
      </section>
    )
  }

  if (!snapshot) {
    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
        <div className="flex flex-1 items-center justify-center">
          <Button type="button" onClick={() => void fetchContacts()}>
            <RefreshCwIcon />
            Tentar novamente
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg bg-background">
      <header className="shrink-0 border-b border-border/80 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal text-foreground">
              Contatos
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <MetricPill icon={ContactIcon} label={`${snapshot.totals.contacts} contatos`} />
              <MetricPill icon={SmartphoneIcon} label={`${snapshot.totals.instances} WhatsApps`} />
              <MetricPill icon={TagIcon} label={`${snapshot.totals.labels} etiquetas`} />
              {snapshot.totals.blocked ? (
                <MetricPill icon={BanIcon} label={`${snapshot.totals.blocked} bloqueados`} />
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSyncing}
              onClick={() => void fetchContacts()}
            >
              {isSyncing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Sincronizar
            </Button>
            <Button type="button" variant="outline" onClick={openImportModal}>
              <UploadIcon />
              Importar
            </Button>
            <Button type="button" variant="outline" onClick={openExportModal}>
              <DownloadIcon />
              Exportar
            </Button>
            <Button type="button" onClick={openAddModal}>
              <PlusIcon />
              Adicionar contato
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_160px]">
          <div className="relative min-w-0">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              placeholder="Pesquisar por nome ou numero"
              className="pl-9"
              onChange={(event) => {
                resetContactPagination()
                setQuery(event.target.value)
              }}
            />
          </div>
          <ComboboxSelect
            value={instanceFilter}
            onChange={(value) => {
              resetContactPagination()
              setInstanceFilter(value)
            }}
            options={[
              { value: "all", label: "Todos os WhatsApps" },
              ...snapshot.instances.map((instance) => ({
                value: instance.instanceName,
                label: instance.displayName,
              })),
            ]}
          />
          <ComboboxSelect
            value={labelFilter}
            onChange={(value) => {
              resetContactPagination()
              setLabelFilter(value)
            }}
            options={[
              { value: "all", label: "Todas etiquetas" },
              ...snapshot.labels.map((label) => ({ value: label, label })),
            ]}
          />
          <ComboboxSelect
            value={statusFilter}
            onChange={(value) => {
              resetContactPagination()
              setStatusFilter(value)
            }}
            options={[
              { value: "all", label: "Todos" },
              { value: "blocked", label: "Bloqueados" },
              { value: "reported", label: "Denunciados" },
              { value: "manual", label: "Salvos no sistema" },
            ]}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {filteredContacts.length ? (
          <div className="overflow-hidden rounded-lg border border-border/80">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-[32%] px-3 py-2 text-left font-medium">Contato</th>
                    <th className="w-[18%] px-3 py-2 text-left font-medium">Numero</th>
                    <th className="w-[18%] px-3 py-2 text-left font-medium">WhatsApp</th>
                    <th className="w-[24%] px-3 py-2 text-left font-medium">Etiquetas</th>
                    <th className="w-[8%] px-3 py-2 text-right font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedContacts.map((contact) => (
                    <ContactRow
                      key={contact.id}
                      contact={contact}
                      isBusy={busyContact === contact.id}
                      onCopyNumber={() => copyContactNumber(contact)}
                      onEdit={() => openEditModal(contact)}
                      onLabels={() => openLabelsModal(contact)}
                      onSetBlocked={(value) =>
                        void handleFlagContact(contact, "set-blocked", value)
                      }
                      onSetReported={(value) =>
                        void handleFlagContact(contact, "set-reported", value)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-border/80 px-3 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mostrando {paginationStart}-{paginationEnd} de{" "}
                {filteredContacts.length} contatos
              </span>
              {totalPages > 1 ? (
                <ContactsPagination
                  currentPage={activePage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyContactsState />
        )}
      </div>

      {modal?.type === "add" || modal?.type === "edit" ? (
        <ContactEditorModal
          draft={draft}
          instances={snapshot.instances}
          isEdit={modal.type === "edit"}
          isBusy={isSyncing}
          labels={snapshot.labels}
          newLabel={newLabel}
          onAddLabel={() => {
            setDraft((current) => ({
              ...current,
              labels: addLabel(current.labels, newLabel),
            }))
            setNewLabel("")
          }}
          onChangeDraft={setDraft}
          onChangeNewLabel={setNewLabel}
          onClose={() => setModal(null)}
          onSubmit={handleSubmitContact}
          onToggleLabel={(label) =>
            setDraft((current) => ({
              ...current,
              labels: toggleLabel(current.labels, label),
            }))
          }
        />
      ) : null}

      {modal?.type === "labels" ? (
        <LabelsModal
          contact={modal.contact}
          draft={draft}
          isBusy={isSyncing}
          labels={snapshot.labels}
          newLabel={newLabel}
          onAddLabel={() => {
            setDraft((current) => ({
              ...current,
              labels: addLabel(current.labels, newLabel),
            }))
            setNewLabel("")
          }}
          onChangeNewLabel={setNewLabel}
          onClose={() => setModal(null)}
          onSubmit={handleSubmitLabels}
          onToggleLabel={(label) =>
            setDraft((current) => ({
              ...current,
              labels: toggleLabel(current.labels, label),
            }))
          }
        />
      ) : null}

      {modal?.type === "import" ? (
        <ImportContactsModal
          fallbackInstanceName={exportInstance}
          fileName={importFileName}
          importResult={importResult}
          instances={snapshot.instances}
          isBusy={isSyncing}
          rowsCount={importRows.length}
          onChangeFallbackInstance={setExportInstance}
          onChangeFile={async (file) => {
            setImportFileName(file?.name ?? "")

            if (!file) {
              setImportRows([])
              setImportResult(null)
              return
            }

            const rows = file ? parseContactsSpreadsheet(await file.text()) : []
            setImportRows(rows)
            setImportResult(null)
            toast.info(`${rows.length} linhas prontas para importar.`)
          }}
          onClose={() => setModal(null)}
          onSubmit={handleImportContacts}
        />
      ) : null}

      {modal?.type === "export" ? (
        <ExportContactsModal
          exportInstance={exportInstance}
          instances={snapshot.instances}
          isBusy={isSyncing}
          onChangeExportInstance={setExportInstance}
          onClose={() => setModal(null)}
          onSubmit={handleExportContacts}
        />
      ) : null}
    </section>
  )
}

function ContactRow({
  contact,
  isBusy,
  onCopyNumber,
  onEdit,
  onLabels,
  onSetBlocked,
  onSetReported,
}: {
  contact: EvolutionContact
  isBusy: boolean
  onCopyNumber: () => void
  onEdit: () => void
  onLabels: () => void
  onSetBlocked: (value: boolean) => void
  onSetReported: (value: boolean) => void
}) {
  return (
    <tr className="border-t border-border/70 bg-card/70 text-card-foreground">
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <ContactAvatar contact={contact} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate font-medium">{contact.name}</span>
              {contact.blocked ? <StatusBadge tone="danger">Bloqueado</StatusBadge> : null}
              {contact.reported ? <StatusBadge tone="warning">Denunciado</StatusBadge> : null}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{contact.formattedNumber}</td>
      <td className="px-3 py-2">
        <span className="font-medium">{contact.instanceDisplayName}</span>
      </td>
      <td className="px-3 py-2">
        <LabelList labels={contact.labels} />
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end">
          <ContactActionsMenu
            contact={contact}
            isBusy={isBusy}
            onCopyNumber={onCopyNumber}
            onEdit={onEdit}
            onLabels={onLabels}
            onSetBlocked={onSetBlocked}
            onSetReported={onSetReported}
          />
        </div>
      </td>
    </tr>
  )
}

function ContactActionsMenu({
  contact,
  isBusy,
  onCopyNumber,
  onEdit,
  onLabels,
  onSetBlocked,
  onSetReported,
}: {
  contact: EvolutionContact
  isBusy: boolean
  onCopyNumber: () => void
  onEdit: () => void
  onLabels: () => void
  onSetBlocked: (value: boolean) => void
  onSetReported: (value: boolean) => void
}) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label="Acoes do contato"
          />
        }
      >
        <ChevronRightIcon
          className={cn("transition-transform", isOpen && "rotate-90")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="w-56">
        <DropdownMenuItem onClick={onCopyNumber}>
          <CopyIcon />
          Copiar numero
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon />
          Editar contato
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLabels}>
          <TagIcon />
          Editar etiquetas
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isBusy}
          onClick={() => onSetBlocked(!contact.blocked)}
        >
          {isBusy ? <Loader2Icon className="animate-spin" /> : <BanIcon />}
          {contact.blocked ? "Desbloquear contato" : "Bloquear contato"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isBusy}
          onClick={() => onSetReported(!contact.reported)}
        >
          <FlagIcon />
          {contact.reported ? "Remover denuncia" : "Denunciar contato"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a href={getContactChatHref(contact)} />}>
          <ExternalLinkIcon />
          Abrir no WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ContactEditorModal({
  draft,
  instances,
  isBusy,
  isEdit,
  labels,
  newLabel,
  onAddLabel,
  onChangeDraft,
  onChangeNewLabel,
  onClose,
  onSubmit,
  onToggleLabel,
}: {
  draft: ContactDraft
  instances: EvolutionContactInstance[]
  isBusy: boolean
  isEdit: boolean
  labels: string[]
  newLabel: string
  onAddLabel: () => void
  onChangeDraft: (draft: ContactDraft) => void
  onChangeNewLabel: (value: string) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onToggleLabel: (label: string) => void
}) {
  return (
    <ModalFrame title={isEdit ? "Editar contato" : "Adicionar contato"} onClose={onClose}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="contact-instance">WhatsApp</Label>
          <ComboboxSelect
            id="contact-instance"
            value={draft.instanceName}
            disabled={isEdit || isBusy}
            onChange={(value) => onChangeDraft({ ...draft, instanceName: value })}
            options={instances.map((instance) => ({
              value: instance.instanceName,
              label: instance.displayName,
            }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-name">Nome</Label>
          <Input
            id="contact-name"
            value={draft.name}
            disabled={isBusy}
            maxLength={80}
            onChange={(event) =>
              onChangeDraft({ ...draft, name: event.target.value })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-number">Numero</Label>
          <Input
            id="contact-number"
            value={draft.number}
            disabled={isEdit || isBusy}
            inputMode="tel"
            maxLength={24}
            placeholder="554599999999"
            onChange={(event) =>
              onChangeDraft({ ...draft, number: event.target.value })
            }
          />
        </div>
        <LabelPicker
          labels={labels}
          selectedLabels={draft.labels}
          newLabel={newLabel}
          onAddLabel={onAddLabel}
          onChangeNewLabel={onChangeNewLabel}
          onToggleLabel={onToggleLabel}
        />
        <ModalActions isBusy={isBusy} onClose={onClose} submitLabel="Salvar" />
      </form>
    </ModalFrame>
  )
}

function LabelsModal({
  contact,
  draft,
  isBusy,
  labels,
  newLabel,
  onAddLabel,
  onChangeNewLabel,
  onClose,
  onSubmit,
  onToggleLabel,
}: {
  contact: EvolutionContact
  draft: ContactDraft
  isBusy: boolean
  labels: string[]
  newLabel: string
  onAddLabel: () => void
  onChangeNewLabel: (value: string) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onToggleLabel: (label: string) => void
}) {
  return (
    <ModalFrame title="Etiquetas" onClose={onClose}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="rounded-md bg-background p-3 text-sm">
          <div className="font-medium">{contact.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {contact.formattedNumber}
          </div>
        </div>
        <LabelPicker
          labels={labels}
          selectedLabels={draft.labels}
          newLabel={newLabel}
          onAddLabel={onAddLabel}
          onChangeNewLabel={onChangeNewLabel}
          onToggleLabel={onToggleLabel}
        />
        <ModalActions isBusy={isBusy} onClose={onClose} submitLabel="Aplicar" />
      </form>
    </ModalFrame>
  )
}

function ImportContactsModal({
  fallbackInstanceName,
  fileName,
  importResult,
  instances,
  isBusy,
  rowsCount,
  onChangeFallbackInstance,
  onChangeFile,
  onClose,
  onSubmit,
}: {
  fallbackInstanceName: string
  fileName: string
  importResult: EvolutionContactImportResult | null
  instances: EvolutionContactInstance[]
  isBusy: boolean
  rowsCount: number
  onChangeFallbackInstance: (value: string) => void
  onChangeFile: (file: File | null) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <ModalFrame title="Importar contatos" onClose={onClose} width="max-w-2xl">
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="import-instance">WhatsApp padrao</Label>
          <ComboboxSelect
            id="import-instance"
            value={fallbackInstanceName}
            disabled={isBusy}
            onChange={onChangeFallbackInstance}
            options={instances.map((instance) => ({
              value: instance.instanceName,
              label: instance.displayName,
            }))}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contacts-file">Planilha CSV</Label>
          <CsvUploadField
            id="contacts-file"
            fileName={fileName}
            rowsCount={rowsCount}
            disabled={isBusy}
            onChangeFile={onChangeFile}
          />
        </div>
        {isBusy ? <ImportProgress rowsCount={rowsCount} /> : null}
        <SpreadsheetExample rowsCount={rowsCount} />
        {importResult ? <ImportResult result={importResult} /> : null}
        <ModalActions
          isBusy={isBusy}
          onClose={onClose}
          submitDisabled={!rowsCount}
          submitLabel={isBusy ? "Importando" : "Importar"}
          submitIcon={UploadIcon}
        />
      </form>
    </ModalFrame>
  )
}

function CsvUploadField({
  disabled,
  fileName,
  id,
  onChangeFile,
  rowsCount,
}: {
  disabled: boolean
  fileName: string
  id: string
  onChangeFile: (file: File | null) => void | Promise<void>
  rowsCount: number
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  function handleFile(file: File | null) {
    void onChangeFile(file)
  }

  function clearFile() {
    if (inputRef.current) {
      inputRef.current.value = ""
    }

    handleFile(null)
  }

  return (
    <div className="rounded-lg border border-border/80 bg-background/70 p-3">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".csv,.txt,text/csv"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-5 text-center transition-colors hover:border-primary/60 hover:bg-muted/40",
          disabled && "pointer-events-none opacity-60"
        )}
        onDragOver={(event) => {
          event.preventDefault()
        }}
        onDrop={(event) => {
          event.preventDefault()

          if (!disabled) {
            handleFile(event.dataTransfer.files[0] ?? null)
          }
        }}
      >
        <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileSpreadsheetIcon className="size-5" />
        </span>
        <span className="grid gap-1">
          <span className="text-sm font-semibold">
            {fileName ? "Arquivo selecionado" : "Escolher planilha CSV"}
          </span>
          <span className="text-xs text-muted-foreground">
            {fileName
              ? `${fileName} - ${rowsCount} linhas carregadas`
              : "Arraste o arquivo aqui ou clique para selecionar"}
          </span>
        </span>
      </label>
      {fileName ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border/80 bg-card px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium">{fileName}</div>
            <div className="text-xs text-muted-foreground">
              {rowsCount} linhas prontas para importar
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={clearFile}
          >
            Limpar
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ImportProgress({ rowsCount }: { rowsCount: number }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
      <div className="flex items-center gap-2 font-semibold">
        <Loader2Icon className="size-4 animate-spin" />
        Importando contatos...
      </div>
      <p className="mt-1 text-xs text-primary/80">
        Validando {rowsCount} linhas, removendo repetidos e salvando no sistema.
      </p>
    </div>
  )
}

function ExportContactsModal({
  exportInstance,
  instances,
  isBusy,
  onChangeExportInstance,
  onClose,
  onSubmit,
}: {
  exportInstance: string
  instances: EvolutionContactInstance[]
  isBusy: boolean
  onChangeExportInstance: (value: string) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <ModalFrame title="Exportar contatos" onClose={onClose}>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="export-instance">Origem</Label>
          <ComboboxSelect
            id="export-instance"
            value={exportInstance}
            disabled={isBusy}
            onChange={onChangeExportInstance}
            options={[
              { value: "all", label: "Todos os WhatsApps" },
              ...instances.map((instance) => ({
                value: instance.instanceName,
                label: instance.displayName,
              })),
            ]}
          />
        </div>
        <ModalActions
          isBusy={isBusy}
          onClose={onClose}
          submitLabel="Exportar"
          submitIcon={DownloadIcon}
        />
      </form>
    </ModalFrame>
  )
}

function LabelPicker({
  labels,
  selectedLabels,
  newLabel,
  onAddLabel,
  onChangeNewLabel,
  onToggleLabel,
}: {
  labels: string[]
  selectedLabels: string[]
  newLabel: string
  onAddLabel: () => void
  onChangeNewLabel: (value: string) => void
  onToggleLabel: (label: string) => void
}) {
  const [labelQuery, setLabelQuery] = React.useState("")
  const normalizedQuery = normalizeText(labelQuery)
  const orderedLabels = React.useMemo(() => {
    return [...labels].sort((left, right) => {
      const leftSelected = selectedLabels.includes(left)
      const rightSelected = selectedLabels.includes(right)

      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1
      }

      return left.localeCompare(right)
    })
  }, [labels, selectedLabels])
  const filteredLabels = React.useMemo(() => {
    if (!normalizedQuery) {
      return orderedLabels
    }

    return orderedLabels.filter((label) =>
      normalizeText(label).includes(normalizedQuery)
    )
  }, [normalizedQuery, orderedLabels])

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Etiquetas</Label>
        <span className="text-xs text-muted-foreground">
          {selectedLabels.length} selecionadas
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/80 bg-background/70">
        <div className="border-b border-border/80 p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={labelQuery}
              placeholder="Pesquisar etiqueta"
              className="h-8 bg-card pl-8"
              onChange={(event) => setLabelQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="max-h-44 overflow-y-auto p-2">
          {filteredLabels.length ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {filteredLabels.map((label) => {
                const selected = selectedLabels.includes(label)

                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={selected}
                    title={label}
                    className={cn(
                      "flex h-8 min-w-0 items-center gap-2 rounded-md border px-2 text-left text-sm transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border/70 bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    )}
                    onClick={() => onToggleLabel(label)}
                  >
                    {selected ? (
                      <CheckIcon className="size-3.5 shrink-0" />
                    ) : (
                      <TagIcon className="size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/80 text-sm text-muted-foreground">
              Nenhuma etiqueta encontrada.
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          value={newLabel}
          maxLength={32}
          placeholder="Nova etiqueta"
          onChange={(event) => onChangeNewLabel(event.target.value)}
        />
        <Button type="button" variant="outline" onClick={onAddLabel}>
          <PlusIcon />
          Criar
        </Button>
      </div>
    </div>
  )
}

function SpreadsheetExample({ rowsCount }: { rowsCount: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80">
      <div className="flex items-center justify-between gap-3 bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <span>Modelo da planilha</span>
        <span>{rowsCount} linhas carregadas</span>
      </div>
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <thead className="bg-background text-muted-foreground">
          <tr>
            {Object.keys(CONTACT_IMPORT_EXAMPLE[0]).map((key) => (
              <th key={key} className="border-t border-border/70 px-3 py-2 text-left font-medium">
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CONTACT_IMPORT_EXAMPLE.map((row) => (
            <tr key={row.numero} className="border-t border-border/70 bg-card/60">
              <td className="px-3 py-2">{row.nome}</td>
              <td className="px-3 py-2">{row.numero}</td>
              <td className="px-3 py-2">{row.etiquetas}</td>
              <td className="px-3 py-2">{row.whatsapp || "usa o padrao"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImportResult({ result }: { result: EvolutionContactImportResult }) {
  return (
    <div className="rounded-lg border border-border/80 bg-background p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-3">
        <ImportResultMetric
          label="Importados"
          value={result.added}
          tone="success"
        />
        <ImportResultMetric
          label="Repetidos deixados de lado"
          value={result.duplicates}
          tone="warning"
        />
        <ImportResultMetric
          label="Invalidos"
          value={result.invalid}
          tone="neutral"
        />
      </div>
      {result.errors.length ? (
        <div className="mt-3 rounded-md border border-border/80 bg-card px-3 py-2 text-xs text-muted-foreground">
          {result.errors.slice(0, 3).join(" | ")}
        </div>
      ) : null}
    </div>
  )
}

function ImportResultMetric({
  label,
  tone,
  value,
}: {
  label: string
  tone: "neutral" | "success" | "warning"
  value: number
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        tone === "success" && "border-primary/30 bg-primary/10 text-primary",
        tone === "warning" && "border-yellow-500/30 bg-yellow-500/10 text-yellow-500",
        tone === "neutral" && "border-border bg-card text-muted-foreground"
      )}
    >
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="mt-1 text-xs font-medium">{label}</div>
    </div>
  )
}

function ModalFrame({
  children,
  onClose,
  title,
  width = "max-w-lg",
}: {
  children: React.ReactNode
  onClose: () => void
  title: string
  width?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-lg border border-border/80 bg-card p-5 text-card-foreground shadow-xl",
          width
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Fechar" icon={XCircleIcon} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({
  isBusy,
  onClose,
  submitDisabled = false,
  submitIcon: SubmitIcon,
  submitLabel,
}: {
  isBusy: boolean
  onClose: () => void
  submitDisabled?: boolean
  submitIcon?: LucideIcon
  submitLabel: string
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-border/80 pt-4">
      <Button type="button" variant="outline" disabled={isBusy} onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" disabled={isBusy || submitDisabled}>
        {isBusy ? (
          <Loader2Icon className="animate-spin" />
        ) : SubmitIcon ? (
          <SubmitIcon />
        ) : null}
        {submitLabel}
      </Button>
    </div>
  )
}

type ComboboxOption = {
  value: string
  label: string
}

function ComboboxSelect({
  disabled,
  id,
  onChange,
  options,
  placeholder = "Selecione",
  value,
}: {
  disabled?: boolean
  id?: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
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
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-background"
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

function ContactAvatar({ contact }: { contact: EvolutionContact }) {
  const initials = contact.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  if (contact.profilePicUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={contact.profilePicUrl}
        alt=""
        className="size-9 shrink-0 rounded-md border border-border object-cover"
      />
    )
  }

  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold">
      {initials || "CT"}
    </div>
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

function LabelList({ labels }: { labels: string[] }) {
  if (!labels.length) {
    return <span className="text-xs text-muted-foreground">Sem etiqueta</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.slice(0, 3).map((label) => (
        <span
          key={label}
          className="inline-flex h-6 items-center rounded-md border border-primary/25 bg-primary/10 px-2 text-xs text-primary"
        >
          {label}
        </span>
      ))}
      {labels.length > 3 ? (
        <span className="text-xs text-muted-foreground">+{labels.length - 3}</span>
      ) : null}
    </div>
  )
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "danger" | "warning"
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium",
        tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "warning" && "border-amber-300/30 bg-amber-500/10 text-amber-300"
      )}
    >
      {children}
    </span>
  )
}

function IconButton({
  label,
  icon: Icon,
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
            variant="outline"
            aria-label={label}
            className={className}
            {...props}
          />
        }
      >
        <Icon className={cn(props.disabled && label.includes("Bloquear") && "animate-spin")} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

type ContactPaginationItem = number | "ellipsis-start" | "ellipsis-end"

function ContactsPagination({
  currentPage,
  onPageChange,
  totalPages,
}: {
  currentPage: number
  onPageChange: (page: number) => void
  totalPages: number
}) {
  const items = getContactPaginationItems(currentPage, totalPages)

  function changePage(event: React.MouseEvent<HTMLAnchorElement>, page: number) {
    event.preventDefault()
    onPageChange(Math.min(Math.max(page, 1), totalPages))
  }

  return (
    <Pagination className="mx-0 w-auto justify-start sm:justify-end">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text=""
            size="icon"
            aria-label="Pagina anterior"
            aria-disabled={currentPage <= 1}
            tabIndex={currentPage <= 1 ? -1 : undefined}
            className={cn(currentPage <= 1 && "pointer-events-none opacity-50")}
            onClick={(event) => changePage(event, currentPage - 1)}
          />
        </PaginationItem>
        {items.map((item) =>
          typeof item === "number" ? (
            <PaginationItem key={item}>
              <PaginationLink
                href="#"
                isActive={item === currentPage}
                aria-label={`Pagina ${item}`}
                onClick={(event) => changePage(event, item)}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationEllipsis />
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            text=""
            size="icon"
            aria-label="Proxima pagina"
            aria-disabled={currentPage >= totalPages}
            tabIndex={currentPage >= totalPages ? -1 : undefined}
            className={cn(
              currentPage >= totalPages && "pointer-events-none opacity-50"
            )}
            onClick={(event) => changePage(event, currentPage + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

function getContactPaginationItems(
  currentPage: number,
  totalPages: number
): ContactPaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: ContactPaginationItem[] = [1]
  let start = Math.max(2, currentPage - 1)
  let end = Math.min(totalPages - 1, currentPage + 1)

  if (currentPage <= 3) {
    end = 4
  }

  if (currentPage >= totalPages - 2) {
    start = totalPages - 3
  }

  if (start > 2) {
    items.push("ellipsis-start")
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page)
  }

  if (end < totalPages - 1) {
    items.push("ellipsis-end")
  }

  items.push(totalPages)

  return items
}

function EmptyContactsState() {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/50 p-6 text-center text-sm text-muted-foreground">
      <div className="flex flex-col items-center gap-3">
        <ContactIcon className="size-9" />
        <span>Nenhum contato encontrado.</span>
      </div>
    </div>
  )
}

async function fetchContactsSnapshot() {
  const response = await fetch("/api/evolution-contacts", {
    cache: "no-store",
  })

  return parseApiResponse<EvolutionContactsSnapshot>(response)
}

async function postContactAction(
  payload: {
    action: ContactAction
    contactId?: string
    fallbackInstanceName?: string
    instanceName?: string
    labels?: string[]
    name?: string
    number?: string
    rows?: EvolutionContactImportRow[]
    value?: boolean
  }
) {
  const response = await fetch("/api/evolution-contacts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  return parseApiResponse<ContactActionResponse>(response)
}

async function parseApiResponse<T>(response: Response) {
  const data = (await response.json().catch(() => undefined)) as
    | { message?: string }
    | T
    | undefined

  if (!response.ok) {
    const errorBody =
      typeof data === "object" && data !== null && "message" in data
        ? data
        : null

    throw new Error(
      errorBody?.message
        ? errorBody.message
        : "Nao foi possivel processar contatos."
    )
  }

  return data as T
}

function parseContactsSpreadsheet(content: string): EvolutionContactImportRow[] {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const delimiter = lines[0].includes(";") ? ";" : ","
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeText)

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line, delimiter)
    const record = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    )

    return {
      name: record.nome || record.name || "",
      number: record.numero || record.number || record.telefone || "",
      labels: splitLabels(record.etiquetas || record.labels || ""),
      instanceName: record.whatsapp || record.instancia || "",
    }
  })
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = []
  let current = ""
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      quoted = !quoted
      continue
    }

    if (char === delimiter && !quoted) {
      values.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

function contactsToCsv(contacts: EvolutionContact[]) {
  const rows = [
    ["nome", "numero", "whatsapp", "etiquetas", "bloqueado", "denunciado", "origem"],
    ...contacts.map((contact) => [
      contact.name,
      contact.number,
      contact.instanceDisplayName,
      contact.labels.join("|"),
      contact.blocked ? "sim" : "nao",
      contact.reported ? "sim" : "nao",
      contact.source,
    ]),
  ]

  return rows.map((row) => row.map(csvCell).join(";")).join("\n")
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function splitLabels(value: string) {
  return value
    .split(/[|,]/)
    .map((label) => label.trim())
    .filter(Boolean)
}

function addLabel(labels: string[], label: string) {
  const normalized = label.trim()

  if (!normalized || labels.includes(normalized)) {
    return labels
  }

  return [...labels, normalized].sort((left, right) => left.localeCompare(right))
}

function toggleLabel(labels: string[], label: string) {
  return labels.includes(label)
    ? labels.filter((item) => item !== label)
    : addLabel(labels, label)
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function copyContactNumber(contact: EvolutionContact) {
  void navigator.clipboard.writeText(contact.number)
  toast.success("Numero copiado.")
}

function getContactChatHref(contact: EvolutionContact) {
  const params = new URLSearchParams({
    contact: contact.number,
    instance: contact.instanceName,
  })

  return `/whatsapp/chat?${params.toString()}`
}

function getRequestErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel processar contatos."
}
