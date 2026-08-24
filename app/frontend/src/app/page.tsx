export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-10 shadow-lg">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">
          RecoverAI
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Project foundation ready.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
          The application shell is configured for the next implementation phase.
          Payment processing, recovery intelligence, and ML features are not yet implemented.
        </p>
        <span className="mt-6 inline-block rounded-md border border-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary">
          Demo / Sandbox Foundation
        </span>
      </div>
    </main>
  );
}