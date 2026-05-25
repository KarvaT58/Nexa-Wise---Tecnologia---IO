import Image from "next/image";
import Link from "next/link";
import { LandingPreloader } from "@/components/landing-preloader";
import { FaWhatsapp, FaXTwitter } from "react-icons/fa6";
import {
  ArrowRightIcon,
  BotIcon,
  CameraIcon,
  CheckIcon,
  Columns3Icon,
  MessageCircleIcon,
  MessageSquareIcon,
  WorkflowIcon,
} from "lucide-react";

const externalFeatures = [
  {
    title: "WhatsApp",
    description: "Chats, grupos e campanhas em uma área organizada para o time comercial.",
  },
  {
    title: "Instagram",
    description: "Atendimento e campanhas para conversas que chegam pelas redes sociais.",
  },
  {
    title: "SMS e e-mail",
    description: "Disparos, retornos e histórico de contato sem espalhar a operação.",
  },
  {
    title: "Contatos",
    description: "Base centralizada para acompanhar clientes, leads e oportunidades.",
  },
];

const internalFeatures = [
  {
    icon: MessageSquareIcon,
    title: "Chat interno",
    description: "Conversas internas separadas do atendimento externo.",
  },
  {
    icon: Columns3Icon,
    title: "Kanban",
    description: "Fluxos visuais para acompanhar etapas, tarefas e prioridades.",
  },
  {
    icon: WorkflowIcon,
    title: "N8N",
    description: "Espaço preparado para conectar automações do sistema.",
  },
  {
    icon: BotIcon,
    title: "IA",
    description: "Camada inteligente para acelerar operações e respostas.",
  },
];

const photoSlots = [
  "Atendimento externo",
  "Equipe interna",
  "Automações e IA",
];

const plans = [
  {
    name: "BAS",
    label: "Básico",
    price: "R$ 97",
    access: "5 áreas liberadas",
    description: "Para começar com atendimento externo essencial e base de contatos.",
    modules: ["Dashboard", "Contatos", "Chat do WhatsApp", "Chat por SMS", "Chat por e-mail"],
    note: "Sem campanhas, automações e sistema interno.",
  },
  {
    name: "PRO",
    label: "Profissional",
    price: "R$ 197",
    access: "16 áreas liberadas",
    description: "Para times que atendem, criam campanhas e organizam a equipe.",
    modules: [
      "Tudo do Básico",
      "Grupos do WhatsApp",
      "Campanhas do WhatsApp",
      "Instagram",
      "Campanhas por SMS",
      "Campanhas por e-mail",
      "Equipe",
      "Chat interno",
      "Grupo interno",
      "Estatísticas",
      "Kanban",
    ],
    note: "Ideal para a operação diária do atendimento.",
    featured: true,
  },
  {
    name: "ELT",
    label: "Elite",
    price: "R$ 397",
    access: "Acesso completo",
    description: "Para empresas que precisam de automações, IA e controle avançado.",
    modules: [
      "Tudo do Profissional",
      "N8N",
      "IA",
      "Configurações",
      "Administração",
      "Sistema Engine",
    ],
    note: "Todos os recursos principais da plataforma.",
  },
];

function InstagramAppIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
    >
      <defs>
        <radialGradient
          id="instagram-app-glow"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="matrix(0 -22 22 0 6 23)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#FEDA75" />
          <stop offset="0.22" stopColor="#FA7E1E" />
          <stop offset="0.48" stopColor="#D62976" />
          <stop offset="0.72" stopColor="#962FBF" />
          <stop offset="1" stopColor="#4F5BD5" />
        </radialGradient>
      </defs>
      <rect
        width="24"
        height="24"
        rx="5.4"
        fill="url(#instagram-app-glow)"
      />
      <rect
        x="5.7"
        y="5.7"
        width="12.6"
        height="12.6"
        rx="3.8"
        stroke="white"
        strokeWidth="1.9"
      />
      <circle cx="12" cy="12" r="3.05" stroke="white" strokeWidth="1.9" />
      <circle cx="16.35" cy="7.65" r="1.15" fill="white" />
    </svg>
  );
}

function WhatsAppAppIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-[5px] bg-[#25D366] text-white ${className ?? ""}`}
    >
      <FaWhatsapp className="size-[72%]" />
    </span>
  );
}

function XAppIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-[5px] bg-black text-white ring-1 ring-white/10 ${className ?? ""}`}
    >
      <FaXTwitter className="size-[66%]" />
    </span>
  );
}

export default function Home() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <LandingPreloader />
      <section className="relative isolate min-h-[88svh] overflow-hidden">
        <Image
          src="/landing-hero.png"
          alt="Interface Nexa Wise com dashboard, canais de atendimento e métricas"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(120,226,0,0.22),transparent_26%),linear-gradient(90deg,rgba(0,0,0,0.9),rgba(0,0,0,0.72)_42%,rgba(0,0,0,0.42))]" />

        <header className="relative z-10 mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex cursor-pointer items-center gap-3">
            <Image
              src="/logo-transparent.png"
              alt="Logo Nexa Wise"
              width={38}
              height={38}
              className="size-10 object-contain"
            />
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-white">Nexa Wise</span>
              <span className="block text-xs font-medium text-white/70">Tecnologia IO</span>
            </span>
          </Link>

          <Link
            href="/login"
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-primary/45 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-black"
          >
            Entrar
            <ArrowRightIcon className="size-4" />
          </Link>
        </header>

        <div className="relative z-10 mx-auto flex min-h-[calc(88svh-5rem)] max-w-7xl flex-col justify-center px-5 pb-16 pt-10 sm:px-8">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-primary">
              SaaS multicanal para operações modernas
            </p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Nexa Wise
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/74 sm:text-lg">
              Unifique atendimento externo, campanhas, contatos, comunicação interna,
              automações e IA em uma plataforma preparada para crescer com sua operação.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-bold text-black transition-colors hover:bg-primary/90"
              >
                Entrar no sistema
                <ArrowRightIcon className="size-4" />
              </Link>
              <a
                href="#planos"
                className="inline-flex h-12 cursor-pointer items-center justify-center rounded-md border border-white/18 px-6 text-sm font-semibold text-white transition-colors hover:border-primary/70 hover:text-primary"
              >
                Ver planos
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="externo" className="border-y border-white/8 bg-sidebar px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">Sistema externo</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Canais externos no mesmo lugar.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              A parte externa foi pensada para centralizar conversas, campanhas e contatos
              dos canais que conectam sua empresa com clientes e leads.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {externalFeatures.map((feature) => (
              <article
                key={feature.title}
                className="rounded-lg border border-white/10 bg-background/70 p-5"
              >
                <MessageCircleIcon className="size-5 text-primary" />
                <h3 className="mt-5 text-base font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="interno" className="px-5 py-20 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-primary">Sistema interno</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Organização interna para operar com clareza.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              Equipe, chat interno, grupos, estatísticas, Kanban, N8N e IA ajudam a
              transformar atendimento em processo, rotina e evolução contínua.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {internalFeatures.map((feature) => {
              const Icon = feature.icon;

              return (
                <article
                  key={feature.title}
                  className="rounded-lg border border-white/10 bg-sidebar p-5"
                >
                  <Icon className="size-5 text-primary" />
                  <h3 className="mt-5 text-base font-semibold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-sidebar px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">Campos para fotos</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                Espaços prontos para imagens do produto.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">
              Aqui você pode trocar depois por prints reais, fotos da equipe ou imagens
              das automações funcionando.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {photoSlots.map((slot) => (
              <div
                key={slot}
                className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-primary/35 bg-background/60 p-6"
              >
                <div className="text-center">
                  <CameraIcon className="mx-auto size-8 text-primary" />
                  <p className="mt-4 text-sm font-semibold text-white">{slot}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Campo para foto</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-primary">Planos</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Planos por acesso ao sistema.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
              Cada plano libera um conjunto de áreas da Nexa Wise. Os valores são
              temporários para você ajustar depois.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`flex h-full flex-col rounded-lg border p-6 ${
                  plan.featured
                    ? "border-primary/70 bg-primary/8"
                    : "border-white/10 bg-sidebar"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">{plan.name}</p>
                    <h3 className="mt-1 text-xl font-semibold text-white">{plan.label}</h3>
                  </div>
                  {plan.featured ? (
                    <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-black">
                      Popular
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 border-y border-white/8 py-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Liberação
                  </span>
                  <span className="text-sm font-semibold text-primary">{plan.access}</span>
                </div>

                <p className="mt-6 text-4xl font-semibold text-white">
                  {plan.price}
                  <span className="text-sm font-medium text-muted-foreground">/mês</span>
                </p>
                <p className="mt-4 min-h-12 text-sm leading-6 text-muted-foreground">
                  {plan.description}
                </p>

                <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-white/58">
                  Inclui no sistema
                </p>
                <ul className="mt-4 grid gap-3">
                  {plan.modules.map((module) => (
                    <li key={module} className="flex items-center gap-3 text-sm text-white/82">
                      <CheckIcon className="size-4 text-primary" />
                      {module}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs leading-5 text-muted-foreground">{plan.note}</p>

                <div className="mt-auto pt-8">
                  <Link
                    href="/login"
                    className={`inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-md text-sm font-bold transition-colors ${
                      plan.featured
                        ? "bg-primary text-black hover:bg-primary/90"
                        : "border border-white/12 text-white hover:border-primary/70 hover:text-primary"
                    }`}
                  >
                    Entrar
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/8 bg-sidebar px-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-transparent.png"
              alt="Logo Nexa Wise"
              width={34}
              height={34}
              className="size-8 object-contain"
            />
            <p className="text-xs text-muted-foreground">
              © 2026 Nexa Wise. Todos os direitos reservados.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="#"
              aria-label="WhatsApp"
              className="inline-flex cursor-pointer items-center justify-center transition-opacity hover:opacity-80"
            >
              <WhatsAppAppIcon className="size-5" />
            </a>
            <a
              href="#"
              aria-label="Instagram"
              className="inline-flex cursor-pointer items-center justify-center transition-opacity hover:opacity-80"
            >
              <InstagramAppIcon className="size-5" />
            </a>
            <a
              href="#"
              aria-label="X"
              className="inline-flex cursor-pointer items-center justify-center transition-opacity hover:opacity-80"
            >
              <XAppIcon className="size-5" />
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
