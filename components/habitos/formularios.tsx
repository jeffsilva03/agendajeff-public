"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { horaCurta, type Cadeia, type Habito, type Passo, type Periodo } from "@motor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NOVO = "__novo__";
const NENHUMA = "__nenhuma__";

function Campo({ id, rotulo, dica, children }: { id: string; rotulo: string; dica?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px]">{rotulo}</Label>
      {children}
      {dica && <p className="text-xs leading-relaxed text-muted-foreground">{dica}</p>}
    </div>
  );
}

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Frase de intenção de implementação (Gollwitzer): "Depois do X, eu vou Y." */
function Intencao({ gatilho, acao }: { gatilho: string; acao: string }) {
  if (!gatilho.trim() && !acao.trim()) return null;
  const g = gatilho.trim();
  const quando = !g ? "Depois de ___" : /^(depois|ao|à|quando|antes)(\s|$)/i.test(g) ? maiuscula(g) : `Depois de ${minuscula(g)}`;
  return (
    <p className="rounded-lg border bg-secondary/50 px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">Sua intenção: </span>
      {quando}, eu vou {acao.trim() ? minuscula(acao.trim()) : "___"}.
    </p>
  );
}

async function executar(acao: () => Promise<void>, ok: string, fechar: () => void, setOcupado: (b: boolean) => void) {
  setOcupado(true);
  try {
    await acao();
    toast.success(ok);
    fechar();
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    setOcupado(false);
  }
}

/* ---------- Novo hábito ---------- */

export function DialogoNovoHabito({ aberto, onFechar, cadeias, onSalvar }: {
  aberto: boolean; onFechar: () => void; cadeias: Cadeia[];
  onSalvar: (d: { nome: string; cadeiaId: string | null; gatilho: string; minimo: string; completo: string }) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [cadeiaId, setCadeiaId] = useState(NENHUMA);
  const [gatilho, setGatilho] = useState("");
  const [minimo, setMinimo] = useState("");
  const [completo, setCompleto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const fechar = () => { onFechar(); setNome(""); setCadeiaId(NENHUMA); setGatilho(""); setMinimo(""); setCompleto(""); };
  const naCadeia = cadeiaId !== NENHUMA;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo hábito</DialogTitle>
          <DialogDescription>Ancore num momento que já acontece todo dia. O mínimo conta como feito.</DialogDescription>
        </DialogHeader>
        <form id="form-habito" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          executar(() => onSalvar({ nome, cadeiaId: naCadeia ? cadeiaId : null, gatilho, minimo, completo }), "Hábito criado.", fechar, setOcupado);
        }}>
          <Campo id="h-nome" rotulo="Hábito">
            <Input id="h-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Revisar flashcards" autoFocus />
          </Campo>
          <Campo id="h-cadeia" rotulo="Em qual cadeia entra?" dica="Fora de cadeia, ele fica guardado e não aparece no Hoje.">
            <Select value={cadeiaId} onValueChange={setCadeiaId}>
              <SelectTrigger id="h-cadeia" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUMA}>Nenhuma por enquanto</SelectItem>
                {cadeias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          {naCadeia && (
            <>
              <Campo id="h-gatilho" rotulo="Gatilho" dica="Algo que já acontece sozinho. Ex.: depois de guardar o celular.">
                <Input id="h-gatilho" required value={gatilho} onChange={(e) => setGatilho(e.target.value)} placeholder="Depois de…" />
              </Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="h-min" rotulo="Versão mínima" dica="Fácil o bastante para um dia ruim.">
                  <Input id="h-min" required value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Ex.: 5 cartões" />
                </Campo>
                <Campo id="h-comp" rotulo="Versão completa" dica="Opcional.">
                  <Input id="h-comp" value={completo} onChange={(e) => setCompleto(e.target.value)} placeholder="Ex.: 30 cartões" />
                </Campo>
              </div>
              <Intencao gatilho={gatilho} acao={nome} />
            </>
          )}
        </form>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Formar um hábito leva em média 66 dias (de 18 a 254).</p>
          <Button type="submit" form="form-habito" disabled={ocupado}>Criar hábito</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Passo (adicionar ou editar) ---------- */

export function DialogoPasso({ aberto, onFechar, cadeia, passo, habitos, cadeias = [], habitoInicial, onSalvar }: {
  aberto: boolean; onFechar: () => void; cadeia: Cadeia | null; passo: Passo | null; habitos: Habito[];
  /** Todas as cadeias: ao editar, dá para mover o passo para outra (mantendo gatilho e mínimo). */
  cadeias?: Cadeia[];
  habitoInicial?: string;
  onSalvar: (d: { habitoId: string | null; novoNome: string | null; gatilho: string; minimo: string; completo: string; naoAntes: string; cadeiaId: string }) => Promise<void>;
}) {
  const editando = !!passo;
  const [habitoId, setHabitoId] = useState(passo?.habitoId ?? habitoInicial ?? "");
  const [cadeiaId, setCadeiaId] = useState(cadeia?.id ?? "");
  const [novoNome, setNovoNome] = useState("");
  const [gatilho, setGatilho] = useState(passo?.gatilho ?? "");
  const [minimo, setMinimo] = useState(passo?.minimo ?? "");
  const [completo, setCompleto] = useState(passo?.completo ?? "");
  const [naoAntes, setNaoAntes] = useState(passo?.naoAntes ?? "");
  const [ocupado, setOcupado] = useState(false);
  const naCadeia = new Set(cadeia?.passos.map((p) => p.habitoId));
  const disponiveis = habitos.filter((h) => !naCadeia.has(h.id) || h.id === passo?.habitoId);
  const nomeAcao = habitoId === NOVO ? novoNome : habitos.find((h) => h.id === habitoId)?.nome ?? "";

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? `Editar passo: ${nomeAcao}` : `Adicionar passo em ${cadeia?.nome}`}</DialogTitle>
          <DialogDescription>Cada passo é disparado pelo anterior. O mínimo conta como feito.</DialogDescription>
        </DialogHeader>
        <form id="form-passo" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!habitoId) { toast.error("Escolha um hábito."); return; }
          executar(() => onSalvar({
            habitoId: habitoId === NOVO ? null : habitoId, novoNome: habitoId === NOVO ? novoNome : null,
            gatilho, minimo, completo, naoAntes, cadeiaId,
          }), editando ? (cadeiaId !== cadeia?.id ? `Passo movido para ${cadeias.find((c) => c.id === cadeiaId)?.nome}.` : "Passo salvo.") : "Passo adicionado.", onFechar, setOcupado);
        }}>
          {!editando && (
            <Campo id="p-habito" rotulo="Hábito">
              <Select value={habitoId} onValueChange={setHabitoId}>
                <SelectTrigger id="p-habito" className="w-full"><SelectValue placeholder="Escolha um hábito" /></SelectTrigger>
                <SelectContent>
                  {disponiveis.map((h) => <SelectItem key={h.id} value={h.id}>{h.nome}</SelectItem>)}
                  <SelectItem value={NOVO}>+ Criar hábito novo</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          )}
          {editando && cadeias.length > 1 && (
            <Campo id="p-cadeia" rotulo="Cadeia (bloco do dia)" dica="Mudar aqui move o hábito para outra cadeia, com o mesmo gatilho e mínimo. O histórico continua.">
              <Select value={cadeiaId} onValueChange={setCadeiaId}>
                <SelectTrigger id="p-cadeia" className="w-full" aria-label="Cadeia do passo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cadeias.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={c.id !== cadeia?.id && c.passos.some((x) => x.habitoId === passo?.habitoId)}>
                      {c.nome}{c.janelaInicio && c.janelaFim ? ` (${horaCurta(c.janelaInicio)}–${horaCurta(c.janelaFim)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          )}
          {habitoId === NOVO && (
            <Campo id="p-novo" rotulo="Nome do novo hábito">
              <Input id="p-novo" required value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus />
            </Campo>
          )}
          <Campo id="p-gatilho" rotulo="Gatilho" dica="Escreva como &quot;depois de…&quot; ou &quot;ao…&quot;.">
            <Input id="p-gatilho" required value={gatilho} onChange={(e) => setGatilho(e.target.value)} placeholder="Depois de…" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="p-min" rotulo="Versão mínima">
              <Input id="p-min" required value={minimo} onChange={(e) => setMinimo(e.target.value)} />
            </Campo>
            <Campo id="p-comp" rotulo="Versão completa">
              <Input id="p-comp" value={completo} onChange={(e) => setCompleto(e.target.value)} placeholder="Opcional" />
            </Campo>
          </div>
          <Campo id="p-antes" rotulo="Não antes de" dica="Opcional. Ex.: Lectio só depois do café, a partir de 7h30.">
            <Input id="p-antes" type="time" value={naoAntes} onChange={(e) => setNaoAntes(e.target.value)} className="w-36" />
          </Campo>
          <Intencao gatilho={gatilho} acao={nomeAcao} />
        </form>
        <DialogFooter>
          <Button type="submit" form="form-passo" disabled={ocupado}>{editando ? "Salvar passo" : "Adicionar passo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Cadeia (criar ou editar) ---------- */

const DIAS = [
  { d: 1, r: "Seg" }, { d: 2, r: "Ter" }, { d: 3, r: "Qua" }, { d: 4, r: "Qui" }, { d: 5, r: "Sex" }, { d: 6, r: "Sáb" }, { d: 0, r: "Dom" },
];
const PERIODOS: { v: Periodo; r: string }[] = [
  { v: "manha", r: "Manhã" }, { v: "tarde", r: "Tarde" }, { v: "noite", r: "Noite" }, { v: "livre", r: "Sem horário fixo" },
];

export function DialogoCadeia({ aberto, onFechar, cadeia, onSalvar, onRemover }: {
  aberto: boolean; onFechar: () => void; cadeia: Cadeia | null;
  onSalvar: (d: { nome: string; ancora: string; diasSemana: number[]; periodo: Periodo; dependeAula: boolean; janelaInicio: string | null; janelaFim: string | null; lembrete: boolean }) => Promise<void>;
  onRemover?: () => Promise<void>;
}) {
  const [nome, setNome] = useState(cadeia?.nome ?? "");
  const [ancora, setAncora] = useState(cadeia?.ancora ?? "");
  const [dias, setDias] = useState<number[]>(cadeia?.diasSemana ?? [1, 2, 3, 4, 5]);
  const [periodo, setPeriodo] = useState<Periodo>(cadeia?.periodo ?? "manha");
  const [dependeAula, setDependeAula] = useState(cadeia?.dependeAula ?? false);
  const [ji, setJi] = useState(cadeia?.janelaInicio ?? "");
  const [jf, setJf] = useState(cadeia?.janelaFim ?? "");
  const [lembrete, setLembrete] = useState(cadeia?.lembrete ?? true);
  const [ocupado, setOcupado] = useState(false);
  const alternar = (d: number) => setDias((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cadeia ? `Editar ${cadeia.nome}` : "Nova cadeia"}</DialogTitle>
          <DialogDescription>Uma cadeia é uma sequência de hábitos que começa num momento fixo do dia.</DialogDescription>
        </DialogHeader>
        <form id="form-cadeia" className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!dias.length) { toast.error("Escolha pelo menos um dia."); return; }
          if (!!ji !== !!jf) { toast.error("Preencha o início e o fim da janela, ou deixe os dois vazios."); return; }
          executar(() => onSalvar({ nome, ancora, diasSemana: dias, periodo, dependeAula, janelaInicio: ji || null, janelaFim: jf || null, lembrete }),
            cadeia ? "Cadeia salva." : "Cadeia criada.", onFechar, setOcupado);
        }}>
          <Campo id="c-nome" rotulo="Nome">
            <Input id="c-nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Noite" />
          </Campo>
          <Campo id="c-ancora" rotulo="Âncora" dica="O momento que dispara a cadeia. Ex.: terminar o almoço.">
            <Input id="c-ancora" required value={ancora} onChange={(e) => setAncora(e.target.value)} />
          </Campo>
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium">Dias</legend>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map(({ d, r }) => (
                <button key={d} type="button" aria-pressed={dias.includes(d)} onClick={() => alternar(d)}
                  className={cn("h-9 w-12 rounded-md border text-sm", dias.includes(d) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
                  {r}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo id="c-periodo" rotulo="Período">
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger id="c-periodo" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.v} value={p.v}>{p.r}</SelectItem>)}</SelectContent>
              </Select>
            </Campo>
            <Campo id="c-ji" rotulo="Janela: início">
              <Input id="c-ji" type="time" value={ji} onChange={(e) => setJi(e.target.value)} />
            </Campo>
            <Campo id="c-jf" rotulo="Janela: fim">
              <Input id="c-jf" type="time" value={jf} onChange={(e) => setJf(e.target.value)} />
            </Campo>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">A janela serve para avisar quando um compromisso cai em cima da cadeia.</p>
          <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <span className="text-sm">
              <span className="block font-medium">Só em dia com aula</span>
              <span className="text-xs text-muted-foreground">Em dia sem aula, os hábitos dela viram flexíveis.</span>
            </span>
            <Switch checked={dependeAula} onCheckedChange={setDependeAula} />
          </label>
          <label className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <span className="text-sm">
              <span className="block font-medium">Aparece nos lembretes</span>
              <span className="text-xs text-muted-foreground">Desligado para atividades que você prefere não receber nos lembretes.</span>
            </span>
            <Switch checked={lembrete} onCheckedChange={setLembrete} />
          </label>
        </form>
        <DialogFooter className="sm:justify-between">
          {cadeia && onRemover ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={ocupado}
              onClick={() => { if (confirm(`Remover a cadeia ${cadeia.nome}? Os registros antigos continuam no histórico.`)) executar(onRemover, "Cadeia removida.", onFechar, setOcupado); }}>
              Remover cadeia
            </Button>
          ) : <span />}
          <Button type="submit" form="form-cadeia" disabled={ocupado}>{cadeia ? "Salvar cadeia" : "Criar cadeia"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
