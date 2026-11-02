import Link from "next/link";
import { cn } from "@/lib/utils";

/** Subnavegação da Faculdade (mesmo padrão das abas do Mês). */
export function AbasFaculdade({ atual }: { atual: "geral" | "classroom" }) {
  return (
    <nav aria-label="Seções da faculdade" className="flex gap-1 overflow-x-auto px-4 pb-4 md:px-8">
      {([["geral", "Aulas e avaliações", "/faculdade"], ["classroom", "Atividades Classroom", "/faculdade?aba=classroom"]] as const).map(([id, rotulo, href]) => (
        <Link key={id} href={href} aria-current={atual === id ? "page" : undefined} scroll={false}
          className={cn("shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground", atual === id && "bg-accent font-medium text-foreground")}>
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}
