import Image from "next/image"
import Link from "next/link"

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/login" className="flex items-center gap-2">
            <Image
              src="/logo-transparent.png"
              alt="Logo Nexa Wise"
              width={28}
              height={28}
              priority
              className="size-7 object-contain"
            />
            <span className="grid text-left leading-tight">
              <span className="text-sm font-medium">Nexa Wise</span>
              <span className="text-xs text-muted-foreground">
                Tecnologia IO
              </span>
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{children}</div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src="/placeholder.svg"
          alt="Imagem abstrata de autenticação"
          fill
          priority
          sizes="50vw"
          className="object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  )
}
