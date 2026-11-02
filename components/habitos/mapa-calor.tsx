"use client";

import type { DiaHabito, EstadoDia } from "@motor";
import { diaDaSemana, somarDias } from "@motor";
import { diaMes } from "@/lib/apresentacao";
import { cn } from "@/lib/utils";

const ESTILO: Record<EstadoDia | "antes" | "futuro", string> = {
  completo: "bg-feito",
  minimo: "bg-minimo",
  nao_feito: "bg-destructive/45",
  pendente: "bg-destructive/25",
  sem_registro: "bg-transparent border border-muted-foreground/30",
  nao_se_aplica: "bg-pulado/35",
  fora: "bg-muted/60",
  antes: "bg-transparent",
  futuro: "bg-transparent border border-dashed border-border/60",
};

export const LEGENDA: { estado: EstadoDia; rotulo: string }[] = [
  { estado: "completo", rotulo: "Feito" },
  { estado: "minimo", rotulo: "Mínimo" },
  { estado: "nao_feito", rotulo: "Não feito" },
  { estado: "nao_se_aplica", rotulo: "Não se aplica" },
  { estado: "fora", rotulo: "Não valia" },
];

const ROTULO: Record<EstadoDia | "antes" | "futuro", string> = {
  completo: "feito", minimo: "mínimo", nao_feito: "não feito", pendente: "não marcado (conta como não feito)",
  sem_registro: "sem registro no dia (fora da conta)",
  nao_se_aplica: "não se aplica", fora: "não valia neste dia", antes: "antes do início", futuro: "ainda não chegou",
};

/**
 * Mapa de calor em semanas (colunas) × dias (linhas, seg a dom), como o do GitHub.
 * Cobre a janela de formação: da semana do início até o 66º dia (dias futuros tracejados).
 * Depois que a janela passa, mostra as últimas `maxSemanas` semanas até hoje.
 */
export function MapaCalor({ linha, hoje, inicio, maxSemanas = 14, tamanho = "sm" }: {
  linha: DiaHabito[]; hoje: string; inicio: string; maxSemanas?: number; tamanho?: "sm" | "lg";
}) {
  const porData = new Map(linha.map((d) => [d.data, d.estado]));
  const segunda = (d: string) => somarDias(d, -((diaDaSemana(d) + 6) % 7));
  const fimFormacao = somarDias(inicio, 65);
  const ultimaSegunda = segunda(hoje > fimFormacao ? hoje : fimFormacao);
  const totalSemanas = Math.round((Date.parse(ultimaSegunda) - Date.parse(segunda(inicio))) / (7 * 864e5)) + 1;
  const semanas = Math.min(totalSemanas, maxSemanas);
  const primeira = somarDias(ultimaSegunda, -7 * (semanas - 1));
  const colunas = Array.from({ length: semanas }, (_, s) =>
    Array.from({ length: 7 }, (_, d) => somarDias(primeira, s * 7 + d)));
  const celula = tamanho === "lg" ? "size-4" : "size-3.5";

  return (
    <div className="flex gap-[3px]" role="img" aria-label="Histórico desde o início do acompanhamento">
      <div className="mr-1 flex flex-col gap-[3px] text-[9px] leading-none text-muted-foreground/70" aria-hidden>
        {["S", "T", "Q", "Q", "S", "S", "D"].map((l, i) => <span key={i} className={cn(celula, "grid place-items-center")}>{i % 2 === 0 ? l : ""}</span>)}
      </div>
      {colunas.map((dias, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {dias.map((d) => {
            const bruto = d > hoje ? "futuro" : d < inicio ? "antes" : porData.get(d) ?? "fora";
            // Hoje ainda pendente não é falha: o dia não acabou.
            const pendenteHoje = d === hoje && (bruto === "pendente" || bruto === "sem_registro");
            const estado = pendenteHoje ? "fora" : bruto;
            const rotulo = pendenteHoje ? "hoje, ainda pendente" : ROTULO[estado];
            return (
              // title nativo: centenas de células, tooltip leve
              <span key={d} title={`${diaMes(d)}: ${rotulo}`}
                className={cn(celula, "rounded-[3px]", ESTILO[estado], d === hoje && "ring-1 ring-foreground/70 ring-offset-1 ring-offset-card",
                  d === fimFormacao && estado === "futuro" && "border-feito/60")} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Legenda() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {LEGENDA.map(({ estado, rotulo }) => (
        <li key={estado} className="flex items-center gap-1.5">
          <span className={cn("size-[11px] rounded-[3px]", ESTILO[estado])} aria-hidden />{rotulo}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className={cn("size-[11px] rounded-[3px]", ESTILO.pendente)} aria-hidden />Não marcado
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cn("size-[11px] rounded-[3px]", ESTILO.sem_registro)} aria-hidden />Dia sem registro
      </li>
    </ul>
  );
}
