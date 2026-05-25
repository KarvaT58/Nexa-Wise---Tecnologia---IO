import {
  EvolutionApiError,
  EvolutionConfigError,
  getEvolutionWhatsAppSettings,
} from "@/lib/evolution-api"
import {
  isEvolutionPlanCode,
  type EvolutionPlanCode,
} from "@/lib/evolution-whatsapp-local-store"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    return Response.json({ message: "Nao autenticado." }, { status: 401 })
  }

  const userId = currentUser.email
  const plan = parsePlan(url.searchParams.get("plan") ?? currentUser.plan)

  try {
    const settings = await getEvolutionWhatsAppSettings({
      userId,
      plan,
    })

    return Response.json(settings)
  } catch (error) {
    return toErrorResponse(error)
  }
}

function parsePlan(value: string | null): EvolutionPlanCode {
  return isEvolutionPlanCode(value) ? value : "pro"
}

function toErrorResponse(error: unknown) {
  if (error instanceof EvolutionConfigError) {
    return Response.json(
      {
        error: "missing_evolution_config",
        message: error.message,
      },
      { status: 500 }
    )
  }

  if (error instanceof EvolutionApiError) {
    return Response.json(
      {
        error: "evolution_api_error",
        message: error.message,
      },
      { status: error.status || 502 }
    )
  }

  return Response.json(
    {
      error: "unexpected_error",
      message: "Nao foi possivel sincronizar a Evolution API.",
    },
    { status: 500 }
  )
}
