"use client"

import * as React from "react"
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
import { APP_PLANS, getAppPlan, type AppPlanCode } from "@/lib/plans"
import { cn } from "@/lib/utils"

const PLAN_OPTIONS: AppPlanCode[] = ["basic", "pro", "master"]

export function SignupForm({
  className,
  initialPlan = "pro",
  ...props
}: React.ComponentProps<"form"> & {
  initialPlan?: AppPlanCode
}) {
  const router = useRouter()
  const [plan, setPlan] = React.useState<AppPlanCode>(() =>
    getAppPlan(initialPlan, "pro")
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const email = String(formData.get("email") ?? "").trim()
    const password = String(formData.get("password") ?? "")
    const confirmPassword = String(formData.get("confirmPassword") ?? "")
    const acceptedTerms = formData.get("acceptTerms") === "on"

    if (!name || !email || !password || !confirmPassword) {
      toast.warning("Preencha todos os campos.")
      return
    }

    if (password !== confirmPassword) {
      toast.error("As senhas nao conferem.")
      return
    }

    const response = await fetch("/api/auth/signup/start", {
      body: JSON.stringify({
        acceptTerms: acceptedTerms,
        email,
        name,
        password,
        plan,
      }),
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
      toast.error(data?.message ?? "Nao foi possivel criar a conta.")
      return
    }

    toast.success(data?.message ?? "Codigo enviado.")
    router.push(data?.redirectTo ?? "/verify-code?flow=signup")
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
          <h1 className="text-2xl font-bold">Criar sua conta</h1>
          <p className="text-sm text-muted-foreground">
            Escolha um pacote e valide seu e-mail
          </p>
        </div>
        <Field>
          <FieldLabel>Pacote</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            {PLAN_OPTIONS.map((option) => {
              const item = APP_PLANS[option]
              const selected = option === plan

              return (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/70"
                  )}
                  onClick={() => setPlan(option)}
                >
                  <span className="block font-semibold">{item.label}</span>
                </button>
              )
            })}
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="name">Nome completo</FieldLabel>
          <Input id="name" name="name" type="text" placeholder="Nome" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input id="email" name="email" type="email" placeholder="E-mail" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <PasswordInput id="password" name="password" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Confirmar senha</FieldLabel>
          <PasswordInput id="confirm-password" name="confirmPassword" required />
        </Field>
        <Field orientation="horizontal" className="items-start gap-3">
          <input
            id="accept-terms"
            name="acceptTerms"
            type="checkbox"
            required
            className="mt-0.5 size-4 shrink-0 rounded border border-input bg-background accent-primary"
          />
          <FieldLabel
            htmlFor="accept-terms"
            className="block text-sm leading-5 text-muted-foreground"
          >
            Aceito{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
              Termos
            </Link>{" "}
            e a{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">
              Politica de Privacidade
            </Link>
            .
          </FieldLabel>
        </Field>
        <Field>
          <Button type="submit">Criar conta</Button>
        </Field>
        <FieldSeparator>Ou continue com</FieldSeparator>
        <Field>
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              window.location.href = `/api/auth/google/start?mode=signup&plan=${plan}`
            }}
          >
            <GoogleIcon />
            Cadastrar com Google
          </Button>
          <FieldDescription className="px-6 text-center">
            Ja tem uma conta? <Link href="/login">Entrar</Link>
          </FieldDescription>
        </Field>
        <AuthLegalLinks />
      </FieldGroup>
    </form>
  )
}
