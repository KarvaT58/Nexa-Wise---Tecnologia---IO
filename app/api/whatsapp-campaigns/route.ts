import { getCurrentUser } from "@/lib/auth"
import {
  deleteWhatsAppCampaign,
  getWhatsAppCampaignsSnapshot,
  prepareWhatsAppCampaign,
  processWhatsAppCampaignJobs,
  saveWhatsAppCampaign,
  setWhatsAppCampaignStatus,
  WhatsAppCampaignError,
} from "@/lib/whatsapp-campaigns"
import { type WhatsAppCampaignInput } from "@/lib/whatsapp-campaigns-types"

type CampaignRequest = {
  action?:
    | "cancel"
    | "delete"
    | "pause"
    | "prepare"
    | "process"
    | "resume"
    | "save"
  campaignId?: string
  input?: WhatsAppCampaignInput
  limit?: number
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  try {
    return Response.json(await getWhatsAppCampaignsSnapshot(currentUser))
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  let body: CampaignRequest

  try {
    body = (await request.json()) as CampaignRequest
  } catch {
    return Response.json(
      {
        error: "invalid_json",
        message: "Corpo da requisicao invalido.",
      },
      { status: 400 }
    )
  }

  try {
    if (body.action === "save") {
      return Response.json(
        await saveWhatsAppCampaign({
          input: requireInput(body.input),
          user: currentUser,
        })
      )
    }

    if (body.action === "prepare") {
      return Response.json(
        await prepareWhatsAppCampaign({
          input: requireInput(body.input),
          user: currentUser,
        })
      )
    }

    if (body.action === "process") {
      return Response.json(
        await processWhatsAppCampaignJobs({
          limit: body.limit,
          user: currentUser,
        })
      )
    }

    if (body.action === "pause") {
      return Response.json(
        await setWhatsAppCampaignStatus({
          campaignId: requireCampaignId(body.campaignId),
          status: "PAUSED",
          user: currentUser,
        })
      )
    }

    if (body.action === "resume") {
      return Response.json(
        await setWhatsAppCampaignStatus({
          campaignId: requireCampaignId(body.campaignId),
          status: "RUNNING",
          user: currentUser,
        })
      )
    }

    if (body.action === "cancel") {
      return Response.json(
        await setWhatsAppCampaignStatus({
          campaignId: requireCampaignId(body.campaignId),
          status: "CANCELED",
          user: currentUser,
        })
      )
    }

    if (body.action === "delete") {
      return Response.json(
        await deleteWhatsAppCampaign({
          campaignId: requireCampaignId(body.campaignId),
          user: currentUser,
        })
      )
    }

    throw new WhatsAppCampaignError("Acao de campanha nao reconhecida.", 400)
  } catch (error) {
    return toErrorResponse(error)
  }
}

function requireInput(input?: WhatsAppCampaignInput) {
  if (!input) {
    throw new WhatsAppCampaignError("Dados da campanha ausentes.")
  }

  return input
}

function requireCampaignId(campaignId?: string) {
  if (!campaignId) {
    throw new WhatsAppCampaignError("Campanha nao informada.")
  }

  return campaignId
}

function toErrorResponse(error: unknown) {
  if (error instanceof WhatsAppCampaignError) {
    return Response.json(
      {
        error: "campaign_error",
        message: error.message,
      },
      { status: error.status }
    )
  }

  return Response.json(
    {
      error: "unexpected_error",
      message: "Nao foi possivel processar a campanha.",
    },
    { status: 500 }
  )
}
