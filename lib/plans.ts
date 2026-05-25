export type AppPlanCode = "basic" | "pro" | "master"

export const APP_PLANS: Record<
  AppPlanCode,
  { label: string; phoneLimit: number; description: string }
> = {
  basic: {
    label: "Basico",
    phoneLimit: 2,
    description: "2 numeros",
  },
  pro: {
    label: "Pro",
    phoneLimit: 4,
    description: "4 numeros",
  },
  master: {
    label: "Master",
    phoneLimit: 6,
    description: "6 numeros",
  },
}

export function parseAppPlan(value: unknown): AppPlanCode | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()

  if (normalized === "basic" || normalized === "basico") {
    return "basic"
  }

  if (normalized === "pro" || normalized === "profissional") {
    return "pro"
  }

  if (normalized === "master") {
    return "master"
  }

  return null
}

export function getAppPlan(value: unknown, fallback: AppPlanCode = "pro") {
  return parseAppPlan(value) ?? fallback
}
