import Link from "next/link"

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Política de Privacidade</h1>
        <p className="text-muted-foreground">
          Esta política explica como seus dados serão tratados dentro do
          sistema.
        </p>
      </div>
      <div className="space-y-4 text-sm leading-6 text-muted-foreground">
        <p>
          Usamos seu e-mail para identificar sua conta, permitir acesso ao
          sistema e enviar comunicações importantes relacionadas à segurança.
        </p>
        <p>
          Esta página é um modelo inicial. O texto definitivo deve refletir as
          integrações, dados coletados e obrigações legais do produto.
        </p>
      </div>
      <Link
        href="/signup"
        className="text-sm underline underline-offset-4 transition-colors hover:text-primary"
      >
        Voltar para criar conta
      </Link>
    </main>
  )
}
