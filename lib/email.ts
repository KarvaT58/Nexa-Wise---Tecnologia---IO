import { Resend } from "resend"

type OtpEmailInput = {
  code: string
  name?: string | null
  purpose: "signup" | "password-reset"
  to: string
}

export class OtpEmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly code: "recipient_restricted" | "send_failed"
  ) {
    super(message)
    this.name = "OtpEmailDeliveryError"
  }
}

const SUBJECTS: Record<OtpEmailInput["purpose"], string> = {
  signup: "Codigo de verificacao da Nexa Wise",
  "password-reset": "Codigo para recuperar sua senha",
}

export async function sendOtpEmail({
  code,
  name,
  purpose,
  to,
}: OtpEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const subject = SUBJECTS[purpose]
  const greeting = name ? `Olá, ${name}.` : "Olá."
  const text = `${greeting}\n\nSeu codigo de verificacao da Nexa Wise e: ${code}\n\nEle expira em 10 minutos. Se voce nao pediu este codigo, ignore este e-mail.`

  if (!apiKey) {
    console.log(`[Nexa Wise OTP] ${purpose} ${to}: ${code}`)
    return { mode: "console" as const }
  }

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Nexa Wise <onboarding@resend.dev>",
    html: renderOtpEmailHtml({ code, greeting }),
    subject,
    text,
    to,
  })

  if (error) {
    const message = error.message || "Nao foi possivel enviar o e-mail."

    throw new OtpEmailDeliveryError(
      message,
      message.toLowerCase().includes("testing emails")
        ? "recipient_restricted"
        : "send_failed"
    )
  }

  return { mode: "resend" as const }
}

export function getOtpEmailDeliveryMessage(error: unknown) {
  if (
    error instanceof OtpEmailDeliveryError &&
    error.code === "recipient_restricted"
  ) {
    return "O Resend esta em modo teste e so envia para o e-mail dono da conta. Use lucaskarvat58@gmail.com para testar ou verifique um dominio no Resend."
  }

  if (error instanceof Error) {
    return error.message
  }

  return "Nao foi possivel enviar o codigo por e-mail."
}

function renderOtpEmailHtml({
  code,
  greeting,
}: {
  code: string
  greeting: string
}) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <p>${escapeHtml(greeting)}</p>
      <p>Use este codigo para confirmar sua identidade na Nexa Wise:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
      <p>Ele expira em 10 minutos. Se voce nao pediu este codigo, ignore este e-mail.</p>
    </div>
  `
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
