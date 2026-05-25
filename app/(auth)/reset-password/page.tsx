import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { ResetPasswordForm } from "@/components/reset-password-form"

export default async function ResetPasswordPage() {
  const cookieStore = await cookies()
  const canResetPassword =
    Boolean(cookieStore.get("nw_password_reset_allowed")?.value)

  if (!canResetPassword) {
    redirect("/forgot-password")
  }

  return <ResetPasswordForm />
}
