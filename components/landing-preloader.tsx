"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function LandingPreloader() {
  const [phase, setPhase] = useState<"loading" | "leaving">("loading");
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const leaveTimer = window.setTimeout(() => {
      setPhase("leaving");
    }, 1800);

    const removeTimer = window.setTimeout(() => {
      document.body.style.overflow = previousOverflow;
      setMounted(false);
    }, 2350);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div
      data-phase={phase}
      className="landing-preloader fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black text-white"
      role="status"
      aria-live="polite"
      aria-label="Carregando ambiente Nexa Wise"
    >
      <div className="landing-preloader__aura" />
      <div className="landing-preloader__grid" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="landing-preloader__brand flex items-center gap-5 sm:gap-6">
          <Image
            src="/logo-transparent.png"
            alt="Logo Nexa Wise"
            width={84}
            height={84}
            priority
            className="size-16 object-contain sm:size-20"
          />
          <div className="leading-tight">
            <p className="text-xl font-semibold tracking-[0.2em] text-white sm:text-2xl">
              Nexa Wise
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.36em] text-primary sm:text-xs">
              Tecnologia IO
            </p>
          </div>
        </div>

        <div className="landing-preloader__line mt-10 h-px w-44 overflow-hidden bg-white/10 sm:w-56">
          <span className="block h-full w-1/2 bg-primary" />
        </div>

        <p className="landing-preloader__status mt-7 text-[11px] font-semibold uppercase tracking-[0.46em] text-white/62 sm:text-xs">
          Carregando ambiente
        </p>
      </div>
    </div>
  );
}
