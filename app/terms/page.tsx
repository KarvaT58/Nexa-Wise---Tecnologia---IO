import Link from "next/link"

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Termos de Uso</h1>
        <p className="text-muted-foreground">
          Estes termos descrevem as regras gerais para acessar e usar o sistema.
        </p>
      </div>
      <div className="space-y-4 text-sm leading-6 text-muted-foreground">
        <p>
          Ao criar uma conta, você concorda em fornecer informações corretas,
          manter suas credenciais em segurança e usar a plataforma de forma
          responsável.
        </p>
        <p>
          Esta página é um modelo inicial. Quando a autenticação real e as
          regras do produto forem definidas, o texto jurídico final deve ser
          revisado e atualizado.
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
