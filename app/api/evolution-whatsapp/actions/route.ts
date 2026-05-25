import {
  createEvolutionWhatsAppInstance,
  deleteEvolutionWhatsAppInstance,
  EvolutionApiError,
  EvolutionConfigError,
  EvolutionPlanLimitError,
  EvolutionValidationError,
  findEvolutionInstanceSettings,
  getEvolutionWhatsAppSettings,
  refreshEvolutionWhatsAppQr,
  renameEvolutionWhatsAppInstance,
  setEvolutionInstanceSettings,
} from "@/lib/evolution-api"
import {
  isEvolutionPlanCode,
  type EvolutionInstanceSettings,
  type EvolutionPlanCode,
} from "@/lib/evolution-whatsapp-local-store"
import { getCurrentUser } from "@/lib/auth"

type EvolutionAction =
  | "create"
  | "disconnect"
  | "get-settings"
  | "rename"
  | "refresh-qr"
  | "set-settings"
  | "sync"

type EvolutionActionRequest = {
  action?: EvolutionAction
  instanceLabel?: string
  instanceName?: string
  instanceSettings?: EvolutionInstanceSettings
  userId?: string
  plan?: EvolutionPlanCode
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: EvolutionActionRequest

  try {
    body = (await request.json()) as EvolutionActionRequest
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
  const plan = isEvolutionPlanCode(body.plan) ? body.plan : currentUser.plan

  try {
    if (body.action === "create") {
      const result = await createEvolutionWhatsAppInstance({
        userId,
        plan,
        instanceLabel: body.instanceLabel ?? "",
      })

      return Response.json(result)
    }

    if (body.action === "get-settings") {
      if (!body.instanceName) {
        return missingInstanceResponse()
      }

      const [settings, instanceSettings] = await Promise.all([
        getEvolutionWhatsAppSettings({
          userId,
          plan,
        }),
        findEvolutionInstanceSettings(body.instanceName),
      ])

      return Response.json({ settings, instanceSettings })
    }

    if (body.action === "rename") {
      if (!body.instanceName) {
        return missingInstanceResponse()
      }

      const result = await renameEvolutionWhatsAppInstance({
        userId,
        plan,
        instanceName: body.instanceName,
        instanceLabel: body.instanceLabel ?? "",
      })

      return Response.json(result)
    }

    if (body.action === "set-settings") {
      if (!body.instanceName) {
        return missingInstanceResponse()
      }

      if (!body.instanceSettings) {
        return Response.json(
          {
            error: "missing_settings",
            message: "Informe as configuracoes da instancia.",
          },
          { status: 400 }
        )
      }

      const instanceSettings = await setEvolutionInstanceSettings(
        body.instanceName,
        body.instanceSettings
      )
      const settings = await getEvolutionWhatsAppSettings({
        userId,
        plan,
      })

      return Response.json({ settings, instanceSettings })
    }

    if (body.action === "disconnect") {
      if (!body.instanceName) {
        return missingInstanceResponse()
      }

      await deleteEvolutionWhatsAppInstance(body.instanceName)
    }

    if (body.action === "refresh-qr") {
      if (!body.instanceName) {
        return missingInstanceResponse()
      }

      await refreshEvolutionWhatsAppQr(body.instanceName)
    }

    if (!body.action || !isKnownAction(body.action)) {
      return Response.json(
        {
          error: "invalid_action",
          message: "Acao da Evolution nao reconhecida.",
        },
        { status: 400 }
      )
    }

    const settings = await getEvolutionWhatsAppSettings({
      userId,
      plan,
    })

    return Response.json({ settings })
  } catch (error) {
    return toErrorResponse(error)
  }
}

function isKnownAction(action: string): action is EvolutionAction {
  return (
    action === "create" ||
    action === "disconnect" ||
    action === "get-settings" ||
    action === "rename" ||
    action === "refresh-qr" ||
    action === "set-settings" ||
    action === "sync"
  )
}

function missingInstanceResponse() {
  return Response.json(
    {
      error: "missing_instance",
      message: "Informe a instancia da Evolution.",
    },
    { status: 400 }
  )
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

  if (error instanceof EvolutionPlanLimitError) {
    return Response.json(
      {
        error: "plan_limit",
        message: error.message,
      },
      { status: 409 }
    )
  }

  if (error instanceof EvolutionValidationError) {
    return Response.json(
      {
        error: "validation_error",
        message: error.message,
      },
      { status: 400 }
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
      message: "Nao foi possivel executar a acao na Evolution API.",
    },
    { status: 500 }
  )
}
