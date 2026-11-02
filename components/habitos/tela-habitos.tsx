"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import type { Check } from "@motor";
import type { ContextoCompleto } from "@/lib/dados";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { adicionarPasso, criarHabito } from "@/lib/mutacoes";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cabecalho } from "@/components/app/cabecalho";
import { AbaProgresso } from "./aba-progresso";
import { AbaCadeias } from "./aba-cadeias";
import { DialogoNovoHabito } from "./formularios";

export interface NotaHabito { habitoId: string; data: string; status: string; nota: string }

export function TelaHabitos({ ctx, checks, notas, hoje }: { ctx: ContextoCompleto; checks: Check[]; notas: NotaHabito[]; hoje: string }) {
  const router = useRouter();
  const novo = useSearchParams().get("novo");
  const [aba, setAba] = useState(novo === "cadeia" ? "cadeias" : "progresso");
  const [novoHabito, setNovoHabito] = useState(novo === "habito");
  const [novaCadeia, setNovaCadeia] = useState(novo === "cadeia");

  return (
    <>
      <Cabecalho titulo="Hábitos"
        acoes={
          <>
            <Button variant="outline" size="sm" onClick={() => { setAba("cadeias"); setNovaCadeia(true); }}>
              <Plus className="size-4" /> Cadeia
            </Button>
            <Button size="sm" onClick={() => setNovoHabito(true)}>
              <Plus className="size-4" /> Hábito
            </Button>
          </>
        }>
        {ctx.habitos.length} hábitos em {ctx.cadeias.length} cadeias
      </Cabecalho>

      <Tabs value={aba} onValueChange={setAba} className="px-4 pb-10 md:px-8">
        <TabsList className="mb-6">
          <TabsTrigger value="progresso" className="px-3">Progresso</TabsTrigger>
          <TabsTrigger value="cadeias" className="px-3">Cadeias</TabsTrigger>
        </TabsList>
        <TabsContent value="progresso"><AbaProgresso ctx={ctx} checks={checks} notas={notas} hoje={hoje} /></TabsContent>
        <TabsContent value="cadeias"><AbaCadeias ctx={ctx} novaCadeia={novaCadeia} onNovaCadeiaFechar={() => setNovaCadeia(false)} /></TabsContent>
      </Tabs>

      <DialogoNovoHabito aberto={novoHabito} onFechar={() => setNovoHabito(false)} cadeias={ctx.cadeias}
        onSalvar={async (d) => {
          const sb = criarClienteNavegador();
          const id = await criarHabito(sb, d.nome);
          if (d.cadeiaId) await adicionarPasso(sb, d.cadeiaId, { habitoId: id, gatilho: d.gatilho, minimo: d.minimo, completo: d.completo, naoAntes: null });
          router.refresh();
        }} />
    </>
  );
}
