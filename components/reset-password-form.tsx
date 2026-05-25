"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { PasswordInput } from "@/components/password-input"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { cn } from "@/lib/utils"

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const password = String(formData.get("password") ?? "")
    const confirmPassword = String(formData.get("confirmPassword") ?? "")

    if (!password || !confirmPassword) {
      toast.warning("Informe e confirme sua nova senha.")
      return
    }

    if (password !== confirmPassword) {
      toast.error("As senhas nao conferem.")
      return
    }

    const response = await fetch("/api/auth/password/reset", {
      body: JSON.stringify({ password }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    })
    const data = (await response.json().catch(() => null)) as {
      message?: string
      redirectTo?: string
    } | null

    if (!response.ok) {
      toast.error(data?.message ?? "Nao foi possivel alterar a senha.")
      return
    }

    toast.success("Senha alterada.")
    router.replace(data?.redirectTo ?? "/login")
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-6 pb-10", className)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Alterar senha</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Crie uma nova senha para acessar sua conta.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="password">Nova senha</FieldLabel>
          <PasswordInput id="password" name="password" required />
          <FieldDescription className="whitespace-nowrap">
            Use 8+ caracteres, maiuscula e simbolo.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirmar nova senha</FieldLabel>
          <PasswordInput id="confirm-password" name="confirmPassword" required />
        </Field>
        <Field>
          <Button type="submit">Alterar senha</Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
