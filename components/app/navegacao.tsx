"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { CalendarDays, CalendarRange, ChartNoAxesColumn, Briefcase, FolderKanban, GraduationCap, LayoutGrid, Repeat, Moon, Send, Sun, Settings, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { BotaoPaleta } from "./paleta-comandos";

const ITENS = [
  { href: "/hoje", rotulo: "Hoje", Icone: LayoutGrid },
  { href: "/habitos", rotulo: "Hábitos", Icone: Repeat },
  { href: "/agenda", rotulo: "Agenda", Icone: CalendarDays },
  { href: "/faculdade", rotulo: "Faculdade", Icone: GraduationCap, soPc: true },
  { href: "/semana", rotulo: "Planejar semana", Icone: CalendarRange, soPc: true },
  { href: "/mes", rotulo: "Mês", Icone: Target },
  { href: "/freelas", rotulo: "Freelas", Icone: Briefcase },
  { href: "/projetos", rotulo: "Projetos", Icone: FolderKanban },
  { href: "/candidaturas", rotulo: "Candidaturas", Icone: Send, soPc: true },
  { href: "/insights", rotulo: "Insights", Icone: ChartNoAxesColumn },
];

function Marca() {
  return (
    <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="4" cy="8" r="2" /><circle cx="12" cy="8" r="2" /><path d="M6 8h4" />
      </svg>
    </span>
  );
}

export function Navegacao() {
  const atual = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <>
      {/* PC: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-superficie px-3 py-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <Marca />
          <span className="text-[15px] font-semibold tracking-tight">Cadeia</span>
        </div>
        <BotaoPaleta />
        <nav aria-label="Principal" className="flex flex-col gap-0.5">
          {ITENS.map(({ href, rotulo, Icone }) => {
            const ativo = atual.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={ativo ? "page" : undefined}
                className={cn("flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  ativo && "bg-accent font-medium text-foreground")}>
                <Icone className="size-4" aria-hidden />
                {rotulo}
              </Link>
            );
          })}
        </nav>
        <Link href="/ajustes" aria-current={atual.startsWith("/ajustes") ? "page" : undefined}
          className={cn("mt-auto flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
            atual.startsWith("/ajustes") && "bg-accent font-medium text-foreground")}>
          <Settings className="size-4" aria-hidden /> Ajustes
        </Link>
        {/* Ícone e rótulo trocam por CSS, sem depender do tema no servidor */}
        <button type="button" onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
          className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <Sun className="hidden size-4 dark:block" aria-hidden />
          <Moon className="size-4 dark:hidden" aria-hidden />
          <span className="hidden dark:inline">Tema claro</span>
          <span className="dark:hidden">Tema escuro</span>
        </button>
      </aside>

      {/* Celular: barra inferior */}
      <nav aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <ul className="mx-auto flex max-w-lg">
          {ITENS.filter((i) => !("soPc" in i)).map(({ href, rotulo, Icone }) => {
            const ativo = atual.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link href={href} aria-current={ativo ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] text-muted-foreground", ativo && "text-foreground")}>
                  <Icone className="size-[22px]" strokeWidth={ativo ? 2.2 : 1.7} aria-hidden />
                  {rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
