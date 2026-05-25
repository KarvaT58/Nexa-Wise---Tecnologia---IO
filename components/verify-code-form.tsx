"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { cn } from "@/lib/utils"

const codeSlots = [0, 1, 2, 3, 4, 5]

export function VerifyCodeForm({
  flow,
  verificationEmail,
  className,
  ...props
}: React.ComponentProps<"form"> & {
  flow: "signup" | "password-reset"
  verificationEmail?: string
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [codeResent, setCodeResent] = React.useState(false)
  const isSignupFlow = flow === "signup"

  async function handleResendCode() {
    const response = await fetch(
      isSignupFlow ? "/api/auth/signup/resend" : "/api/auth/password/resend",
      { method: "POST" }
    )
    const data = (await response.json().catch(() => null)) as {
      message?: string
    } | null

    if (!response.ok) {
      toast.error(data?.message ?? "Nao foi possivel reenviar o codigo.")
      return
    }

    setCodeResent(true)
    toast.success(data?.message ?? "Codigo reenviado.")
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const code = String(formData.get("code") ?? "").trim()

    if (code.length !== 6) {
      toast.warning("Digite os 6 digitos enviados por e-mail.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(
        isSignupFlow ? "/api/auth/signup/verify" : "/api/auth/password/verify",
        {
          body: JSON.stringify({ code }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        }
      )
      const data = (await response.json().catch(() => null)) as {
        checkoutUrl?: string
        message?: string
        redirectTo?: string
      } | null

      if (!response.ok) {
        toast.error(data?.message ?? "Codigo invalido.")
        return
      }

      if (data?.checkoutUrl) {
        toast.success("E-mail validado. Abrindo checkout.")
        window.location.href = data.checkoutUrl
        return
      }

      toast.success(isSignupFlow ? "Conta liberada." : "Codigo validado.")
      router.push(data?.redirectTo ?? (isSignupFlow ? "/dashboard" : "/reset-password"))
      router.refresh()
    } finally {
      setIsSubmitting(false)
    }
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
          <h1 className="text-2xl font-bold">Validar codigo</h1>
          <p className="flex max-w-full flex-wrap items-center justify-center gap-x-1 text-center text-sm text-muted-foreground">
            {verificationEmail ? (
              <>
                <span className="whitespace-nowrap">
                  Enviamos o codigo para:
                </span>
                <span className="max-w-full break-all border-b border-primary pb-0.5 font-medium text-foreground">
                  {verificationEmail}
                </span>
              </>
            ) : (
              "Informe o codigo enviado por e-mail."
            )}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="code">Codigo de validacao</FieldLabel>
          <div className="flex justify-center">
            <InputOTP
              id="code"
              name="code"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              containerClassName="justify-center"
            >
              <InputOTPGroup>
                {codeSlots.map((slot) => (
                  <InputOTPSlot
                    key={slot}
                    index={slot}
                    className="size-10 text-base"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <FieldDescription className="text-center">
            Use apenas numeros. O codigo expira em alguns minutos.
          </FieldDescription>
        </Field>
        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Validando..." : "Validar codigo"}
          </Button>
          <FieldDescription className="text-center">
            Nao recebeu?{" "}
            <button
              type="button"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
              onClick={handleResendCode}
            >
              Reenviar codigo
            </button>
          </FieldDescription>
          {codeResent && (
            <FieldDescription className="text-center text-primary">
              Codigo reenviado.
            </FieldDescription>
          )}
        </Field>
        <FieldDescription className="text-center">
          Entrou com o e-mail errado?{" "}
          <Link href={isSignupFlow ? "/signup" : "/forgot-password"}>
            Alterar e-mail
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
