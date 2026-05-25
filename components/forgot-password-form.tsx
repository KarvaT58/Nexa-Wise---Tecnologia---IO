"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()

    if (!email) {
      toast.warning("Informe seu e-mail.")
      return
    }

    const response = await fetch("/api/auth/password/forgot", {
      body: JSON.stringify({ email }),
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
      toast.error(data?.message ?? "Nao foi possivel enviar o codigo.")
      return
    }

    toast.success(data?.message ?? "Codigo enviado.")
    router.push(data?.redirectTo ?? "/verify-code?flow=password-reset")
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Recuperar senha</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Informe seu e-mail para receber um codigo de validacao.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" name="email" type="email" placeholder="E-mail" required />
          <FieldDescription>
            Enviaremos um codigo de 6 digitos para confirmar que a conta e sua.
          </FieldDescription>
        </Field>
        <Field>
          <Button type="submit">Enviar codigo</Button>
        </Field>
        <FieldDescription className="text-center">
          <Link href="/login">Voltar para a tela de login</Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
