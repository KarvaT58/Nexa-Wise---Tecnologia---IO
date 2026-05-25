type PageAction = {
  title: string
  href: string
  description: string
}

type AppPageContentProps = {
  title: string
  description: string
  actions?: PageAction[]
}

export function AppPageContent(props: AppPageContentProps) {
  void props

  return (
    <section className="flex h-full min-h-0 items-center justify-center overflow-hidden rounded-lg bg-background p-6 text-center">
      <h1 className="text-xl font-semibold tracking-normal text-muted-foreground">
        Em Desenvolvimento
      </h1>
    </section>
  )
}
