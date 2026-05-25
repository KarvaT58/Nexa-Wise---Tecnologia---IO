"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { AuthLegalLinks } from "@/components/auth-legal-links"
import { GoogleIcon } from "@/components/google-icon"
import { PasswordInput } from "@/components/password-input"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const router = useRouter()

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")

    if (!email || !password) {
      toast.warning("Preencha e-mail e senha.")
      return
    }

    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ email, password }),
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
      toast.error(data?.message ?? "Nao foi possivel entrar.")
      return
    }

    toast.success("Conectado com sucesso.")
    router.replace(data?.redirectTo ?? "/dashboard")
    router.refresh()
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Entrar na sua conta</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Informe seu e-mail para acessar sua conta
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" name="email" type="email" placeholder="E-mail" required />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <Link
              href="/forgot-password"
              className="ml-auto text-sm underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              Esqueceu sua senha?
            </Link>
          </div>
          <PasswordInput id="password" name="password" required />
        </Field>
        <Field>
          <Button type="submit">Entrar</Button>
        </Field>
        <FieldSeparator>Ou continue com</FieldSeparator>
        <Field>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              window.location.href = "/api/auth/google/start?mode=login"
            }}
          >
            <GoogleIcon />
            Conectar com Google
          </Button>
          <FieldDescription className="text-center">
            Ainda nao tem uma conta?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Criar conta
            </Link>
          </FieldDescription>
        </Field>
        <AuthLegalLinks />
      </FieldGroup>
    </form>
  )
}
