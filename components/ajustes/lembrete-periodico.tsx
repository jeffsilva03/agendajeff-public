"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, Plus, Send, Trash2 } from "lucide-react";
import { horaCurta, horariosPeriodicos } from "@motor";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ConfigPeriodico { ativo: boolean; intervalo: number; inicio: string; fim: string }
export interface Frase { id: string; texto: string }

const INTERVALOS = [[60, "1 hora"], [90, "1h30"], [120, "2 horas"], [180, "3 horas"], [240, "4 horas"]] as const;

/** Lembrete a cada N horas com o que falta no dia e uma frase personalizada; frases próprias; prévia. */
export function LembretePeriodico({ inicial, frasesIniciais }: { inicial: ConfigPeriodico; frasesIniciais: Frase[] }) {
  const sb = useMemo(() => criarClienteNavegador(), []);
  const [cfg, setCfg] = useState(inicial);
  const [frases, setFrases] = useState(frasesIniciais);
  const [nova, setNova] = useState("");
  const [previa, setPrevia] = useState<{ titulo: string; corpo: string } | null>(null);
  const horarios = horariosPeriodicos(cfg.inicio, cfg.fim, cfg.intervalo);

  async function salvar(mudar: Partial<ConfigPeriodico>) {
    const novo = { ...cfg, ...mudar };
    if (novo.fim <= novo.inicio) return toast.error("O fim precisa ser depois do início.");
    const antes = cfg;
    setCfg(novo);
    const { error } = await sb.from("profiles").update({
      periodico_ativo: novo.ativo, periodico_intervalo: novo.intervalo, periodico_inicio: novo.inicio, periodico_fim: novo.fim,
    }).not("user_id", "is", null);
    if (error) { setCfg(antes); return toast.error("Não foi possível salvar."); }
    if ("ativo" in mudar) toast.success(novo.ativo ? "Lembretes periódicos ligados." : "Lembretes periódicos desligados.");
  }

  async function adicionarFrase(e: React.FormEvent) {
    e.preventDefault();
    const texto = nova.trim();
    if (texto.length < 3) return;
    const { data, error } = await sb.from("frases").insert({ texto }).select("id, texto").single();
    if (error) return toast.error("Não foi possível salvar a frase.");
    setFrases((l) => [...l, data]);
    setNova("");
  }

  async function removerFrase(f: Frase) {
    const { error } = await sb.from("frases").delete().eq("id", f.id);
    if (error) return toast.error("Não foi possível remover.");
    setFrases((l) => l.filter((x) => x.id !== f.id));
  }

  const [enviando, setEnviando] = useState(false);
  async function enviarExemplo() {
    setEnviando(true);
    const { data, error } = await sb.functions.invoke("push-teste", { body: { tipo: "periodico" } });
    setEnviando(false);
    if (error) return toast.error("Não foi possível enviar.");
    const ok = (data?.resultados ?? []).filter((r: { ok: boolean }) => r.ok).length;
    if (!ok) return toast.error("Nenhum aparelho recebeu. Ative as notificações neste aparelho acima.");
    toast.success(`Exemplo enviado para ${ok} ${ok === 1 ? "aparelho" : "aparelhos"}.`);
  }

  async function verPrevia() {
    const r = await fetch("/api/lembrete-previa", { cache: "no-store" });
    if (!r.ok) return toast.error("Não foi possível montar a prévia.");
    const { mensagem } = await r.json();
    setPrevia(mensagem);
  }

  return (
    <>
      <label className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
        <span className="text-sm">
          <span className="block font-medium">Lembrar do que falta ao longo do dia</span>
          <span className="text-muted-foreground">Só uma frase motivacional. O andamento de tarefas e hábitos continua nos horários fixos.</span>
        </span>
        <Switch checked={cfg.ativo} onCheckedChange={(v) => salvar({ ativo: v })} aria-label="Ligar lembretes periódicos" />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <span className="text-[13px] font-medium">A cada</span>
          <Select value={String(cfg.intervalo)} onValueChange={(v) => salvar({ intervalo: Number(v) })}>
            <SelectTrigger className="w-32" aria-label="Intervalo"><SelectValue /></SelectTrigger>
            <SelectContent>{INTERVALOS.map(([v, r]) => <SelectItem key={v} value={String(v)}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <label className="space-y-1.5"><span className="block text-[13px] font-medium">Das</span>
          <Input type="time" value={cfg.inicio} onChange={(e) => e.target.value && salvar({ inicio: e.target.value })} className="w-28" aria-label="Início" /></label>
        <label className="space-y-1.5"><span className="block text-[13px] font-medium">Até</span>
          <Input type="time" value={cfg.fim} onChange={(e) => e.target.value && salvar({ fim: e.target.value })} className="w-28" aria-label="Fim" /></label>
      </div>
      <p className="numeros text-xs text-muted-foreground">
        Horários: {horarios.map(horaCurta).join(", ") || "nenhum"}. Se um lembrete fixo saiu há menos de 45 min, o periódico daquele horário é pulado.
      </p>

      <div className="rounded-lg border p-4">
        <p className="text-sm font-medium">Suas frases (opcional)</p>
        <p className="text-xs text-muted-foreground">O app já tem mais de 100 frases curtas para manhã, tarde e noite, e mistura com frases sobre a sua sequência, o próximo hábito, a meta do mês e o compromisso do Raio-X. Se quiser, acrescente as suas.</p>
        {frases.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {frases.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">“{f.texto}”</span>
                <button type="button" aria-label={`Remover a frase ${f.texto}`} onClick={() => removerFrase(f)} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={adicionarFrase} className="mt-3 flex gap-2">
          <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Disciplina é lembrar o que você quer." maxLength={200} aria-label="Nova frase" className="h-9" />
          <Button type="submit" variant="outline" size="sm" className="h-9"><Plus className="size-4" /> Frase</Button>
        </form>
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={verPrevia}><Eye className="size-4" /> Ver como ficaria agora</Button>
          <Button variant="outline" size="sm" onClick={enviarExemplo} disabled={enviando}><Send className="size-4" /> Enviar exemplo nos meus aparelhos</Button>
        </div>
        {previa && (
          <div className="mt-3 max-w-md rounded-xl border bg-card p-3 text-sm shadow-sm" role="status">
            <p className="font-semibold">{previa.titulo}</p>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">{previa.corpo}</p>
          </div>
        )}
      </div>
    </>
  );
}
