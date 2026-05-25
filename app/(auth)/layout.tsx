import { AuthFormTransition } from "@/components/auth-form-transition"
import { AuthShell } from "@/components/auth-shell"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (user) {
    redirect("/dashboard")
  }

  return (
    <AuthShell>
      <AuthFormTransition>{children}</AuthFormTransition>
    </AuthShell>
  )
}
