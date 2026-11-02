import type { ReactNode } from "react";

export function Cabecalho({ titulo, children, acoes }: { titulo: ReactNode; children?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-6 pb-4 md:px-8 md:pt-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">{titulo}</h1>
        {children && <div className="mt-1.5 text-sm text-muted-foreground">{children}</div>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}
