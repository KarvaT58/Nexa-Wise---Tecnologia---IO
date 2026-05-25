"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

const EXIT_DURATION = 150
const ENTER_DURATION = 420

export function AuthFormTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [displayChildren, setDisplayChildren] = React.useState(children)
  const [phase, setPhase] = React.useState<"entering" | "leaving" | "idle">(
    "entering"
  )
  const previousPathname = React.useRef(pathname)
  const nextChildren = React.useRef(children)
  const timers = React.useRef<number[]>([])

  React.useEffect(() => {
    nextChildren.current = children

    timers.current.forEach(window.clearTimeout)
    timers.current = []

    if (previousPathname.current === pathname) {
      timers.current.push(window.setTimeout(() => setPhase("idle"), ENTER_DURATION))
      return () => {
        timers.current.forEach(window.clearTimeout)
        timers.current = []
      }
    }

    previousPathname.current = pathname

    timers.current.push(
      window.setTimeout(() => {
        setPhase("leaving")

        timers.current.push(
          window.setTimeout(() => {
            setDisplayChildren(nextChildren.current)
            setPhase("entering")

            timers.current.push(
              window.setTimeout(() => setPhase("idle"), ENTER_DURATION)
            )
          }, EXIT_DURATION)
        )
      }, 0)
    )

    return () => {
      timers.current.forEach(window.clearTimeout)
      timers.current = []
    }
  }, [children, pathname])

  return (
    <div className="auth-transition-stage">
      <div className="auth-form-transition" data-phase={phase}>
        {displayChildren}
      </div>
    </div>
  )
}
