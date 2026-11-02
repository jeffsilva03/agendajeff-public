/** Esqueleto mostrado na hora ao trocar de tela, enquanto o servidor monta a página. */
export default function Carregando() {
  const bloco = "animate-pulse rounded-lg bg-secondary";
  return (
    <div role="status" aria-label="Carregando" className="px-4 pt-4 pb-10 md:px-8 md:pt-8">
      <div className={`${bloco} h-7 w-56`} />
      <div className={`${bloco} mt-3 h-4 w-72 max-w-full`} />
      <div className="mt-6 flex gap-2 overflow-hidden">
        {[0, 1, 2].map((i) => <div key={i} className={`${bloco} h-14 w-64 shrink-0 rounded-xl`} />)}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className={`space-y-2 rounded-xl border bg-coluna p-2 ${c > 0 ? "hidden md:block" : ""}`}>
            {Array.from({ length: c === 0 ? 5 : 2 }, (_, i) => <div key={i} className={`${bloco} h-16 bg-card`} />)}
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
