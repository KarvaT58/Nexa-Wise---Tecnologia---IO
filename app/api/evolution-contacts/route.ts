import {
  addEvolutionContact,
  EvolutionContactError,
  getEvolutionContactsSnapshot,
  importEvolutionContacts,
  setEvolutionContactFlag,
  setEvolutionContactLabels,
  updateEvolutionContact,
} from "@/lib/evolution-contacts"
import {
  type EvolutionContactImportRow,
  type EvolutionContactsSnapshot,
} from "@/lib/evolution-contacts-types"
import { getCurrentUser } from "@/lib/auth"

type ContactAction =
  | "add"
  | "import"
  | "set-blocked"
  | "set-labels"
  | "set-reported"
  | "update"

type ContactActionRequest = {
  action?: ContactAction
  contactId?: string
  fallbackInstanceName?: string
  instanceName?: string
  labels?: string[]
  name?: string
  number?: string
  rows?: EvolutionContactImportRow[]
  userId?: string
  value?: boolean
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  const userId = currentUser.email

  try {
    const snapshot = await getEvolutionContactsSnapshot({ userId })

    return Response.json(snapshot)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  let body: ContactActionRequest

  try {
    body = (await request.json()) as ContactActionRequest
  } catch {
    return Response.json(
      {
        error: "invalid_json",
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 }
    )
  }

  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  const userId = currentUser.email

  try {
    const result = await runContactAction(userId, body)

    return Response.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}

async function runContactAction(
  userId: string,
  body: ContactActionRequest
): Promise<{ snapshot: EvolutionContactsSnapshot; importResult?: unknown }> {
  if (body.action === "add") {
    return addEvolutionContact({
      userId,
      instanceName: body.instanceName ?? "",
      name: body.name ?? "",
      number: body.number ?? "",
      labels: body.labels ?? [],
    })
  }

  if (body.action === "update") {
    return updateEvolutionContact({
      userId,
      contactId: body.contactId ?? "",
      name: body.name ?? "",
      labels: body.labels ?? [],
    })
  }

  if (body.action === "set-labels") {
    return setEvolutionContactLabels({
      userId,
      contactId: body.contactId ?? "",
      labels: body.labels ?? [],
    })
  }

  if (body.action === "set-blocked") {
    return setEvolutionContactFlag({
      userId,
      contactId: body.contactId ?? "",
      field: "blocked",
      value: Boolean(body.value),
    })
  }

  if (body.action === "set-reported") {
    return setEvolutionContactFlag({
      userId,
      contactId: body.contactId ?? "",
      field: "reported",
      value: Boolean(body.value),
    })
  }

  if (body.action === "import") {
    return importEvolutionContacts({
      userId,
      fallbackInstanceName: body.fallbackInstanceName ?? "",
      rows: body.rows ?? [],
    })
  }

  throw new EvolutionContactError("Acao de contatos nao reconhecida.", 400)
}

function toErrorResponse(error: unknown) {
  if (error instanceof EvolutionContactError) {
    return Response.json(
      {
        error: "contact_error",
        message: error.message,
      },
      { status: error.status }
    )
  }

  return Response.json(
    {
      error: "unexpected_error",
      message: "Nao foi possivel executar a acao de contatos.",
    },
    { status: 500 }
  )
}
