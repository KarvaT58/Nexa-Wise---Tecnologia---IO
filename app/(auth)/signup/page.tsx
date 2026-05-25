import { SignupForm } from "@/components/signup-form"
import { getAppPlan } from "@/lib/plans"

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const params = await searchParams

  return <SignupForm initialPlan={getAppPlan(params.plan, "pro")} />
}
