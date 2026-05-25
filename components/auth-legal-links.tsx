import Link from "next/link"

import { cn } from "@/lib/utils"

export function AuthLegalLinks({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "mt-8 text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary",
        className
      )}
    >
      <Link href="/terms">Termos de Uso</Link>
      <span className="mx-2">|</span>
      <Link href="/privacy">Política de Privacidade</Link>
    </p>
  )
}
