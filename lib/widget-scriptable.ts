// Script do widget do iPhone para o app Scriptable (grátis na App Store). O iOS não deixa um app web
// ter widget na tela inicial; o Scriptable roda este script, busca o resumo do dia e desenha o widget.
// O token vai embutido no script (fica só no aparelho) e pode ser revogado em Ajustes.

export function scriptDoWidget(origem: string, token: string): string {
  return `// Cadeia: widget da tela inicial (Scriptable)
// Gerado em Ajustes > Widget. Se o token for revogado, gere outro script lá.
const URL_RESUMO = ${JSON.stringify(`${origem}/api/widget`)};
const TOKEN = ${JSON.stringify(token)};
const URL_APP = ${JSON.stringify(`${origem}/hoje`)};

// ---------- Visual ----------
const COR = {
  topo: new Color("#171b22"), base: new Color("#0b0d11"),
  cartao: new Color("#ffffff", 0.06), borda: new Color("#ffffff", 0.08),
  texto: new Color("#f1f3f7"), suave: new Color("#9aa3b2"), apagado: new Color("#5d6573"),
  feito: new Color("#3ccf86"), aviso: new Color("#f0b544"), azul: new Color("#6b93f5"), trilha: new Color("#ffffff", 0.10),
};

// Fontes arredondadas quando o Scriptable tiver; senão, a do sistema.
function fonte(tamanho, peso) {
  const nome = { negrito: "bold", semi: "semibold", medio: "medium" }[peso] || "regular";
  const arredondada = Font[nome + "RoundedSystemFont"];
  if (typeof arredondada === "function") return arredondada.call(Font, tamanho);
  return nome === "bold" ? Font.boldSystemFont(tamanho) : nome === "semibold" ? Font.semiboldSystemFont(tamanho) : nome === "medium" ? Font.mediumSystemFont(tamanho) : Font.systemFont(tamanho);
}

function texto(pilha, conteudo, tamanho, cor, peso, linhas) {
  const t = pilha.addText(String(conteudo));
  t.font = fonte(tamanho, peso);
  t.textColor = cor;
  t.lineLimit = linhas || 1;
  t.minimumScaleFactor = 0.8;
  return t;
}

function icone(pilha, nome, tamanho, cor) {
  const s = SFSymbol.named(nome);
  if (!s) return null;
  s.applyFont(Font.systemFont(tamanho));
  const img = pilha.addImage(s.image);
  img.imageSize = new Size(tamanho, tamanho);
  img.tintColor = cor;
  return img;
}

function cartao(pilha, preencher) {
  const c = pilha.addStack();
  c.layoutVertically();
  c.backgroundColor = COR.cartao;
  c.cornerRadius = 14;
  c.borderColor = COR.borda;
  c.borderWidth = 1;
  c.setPadding(9, 11, 9, 11);
  preencher(c);
  return c;
}

function rotulo(pilha, nomeIcone, conteudo, cor) {
  const l = pilha.addStack();
  l.centerAlignContent();
  icone(l, nomeIcone, 10, cor || COR.suave);
  l.addSpacer(4);
  texto(l, conteudo.toUpperCase(), 9, cor || COR.suave, "semi");
  return l;
}

// Anel de progresso dos hábitos, com a porcentagem no centro.
function anel(pct, lado, espessura, legenda) {
  const ctx = new DrawContext();
  const escala = 3;
  const t = lado * escala, e = espessura * escala;
  ctx.size = new Size(t, t);
  ctx.opaque = false;
  ctx.respectScreenScale = false;
  const r = (t - e) / 2, cx = t / 2, cy = t / 2;
  ctx.setStrokeColor(COR.trilha);
  ctx.setLineWidth(e);
  ctx.strokeEllipse(new Rect(e / 2, e / 2, t - e, t - e));
  if (pct > 0) {
    const pontos = [];
    const passos = Math.max(2, Math.round(120 * pct));
    for (let i = 0; i <= passos; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * pct * i) / passos;
      pontos.push(new Point(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    const arco = new Path();
    arco.addLines(pontos);
    ctx.addPath(arco);
    ctx.setStrokeColor(pct >= 1 ? COR.feito : COR.feito);
    ctx.setLineWidth(e);
    ctx.strokePath();
    // Pontas arredondadas.
    ctx.setFillColor(COR.feito);
    for (const p of [pontos[0], pontos[pontos.length - 1]]) ctx.fillEllipse(new Rect(p.x - e / 2, p.y - e / 2, e, e));
  }
  ctx.setTextAlignedCenter();
  ctx.setTextColor(COR.texto);
  ctx.setFont(fonte(t * 0.22, "negrito"));
  ctx.drawTextInRect(Math.round(pct * 100) + "%", new Rect(0, t * 0.30, t, t * 0.28));
  if (legenda) {
    ctx.setTextColor(COR.suave);
    ctx.setFont(fonte(t * 0.10, "medio"));
    ctx.drawTextInRect(legenda, new Rect(0, t * 0.56, t, t * 0.16));
  }
  return ctx.getImage();
}

function barra(pilha, pct, largura, cor) {
  const ctx = new DrawContext();
  ctx.size = new Size(largura * 3, 12);
  ctx.opaque = false;
  ctx.respectScreenScale = false;
  const fundo = new Path(); fundo.addRoundedRect(new Rect(0, 0, largura * 3, 12), 6, 6);
  ctx.addPath(fundo); ctx.setFillColor(COR.trilha); ctx.fillPath();
  const cheio = new Path(); cheio.addRoundedRect(new Rect(0, 0, Math.max(12, largura * 3 * Math.min(1, pct)), 12), 6, 6);
  ctx.addPath(cheio); ctx.setFillColor(cor || COR.feito); ctx.fillPath();
  const img = pilha.addImage(ctx.getImage());
  img.imageSize = new Size(largura, 4);
}

function fundo(w) {
  const g = new LinearGradient();
  g.colors = [COR.topo, COR.base];
  g.locations = [0, 1];
  g.startPoint = new Point(0, 0);
  g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
}

// ---------- Blocos ----------
function blocoProximo(pilha, d, compacto) {
  return cartao(pilha, (c) => {
    rotulo(c, "arrow.right.circle.fill", d.proximo ? "Próximo" : "Hábitos", d.proximo ? COR.feito : COR.suave);
    c.addSpacer(3);
    if (d.proximo) {
      texto(c, d.proximo.nome, compacto ? 13 : 15, COR.texto, "semi", 2);
      if (!compacto) { c.addSpacer(1); texto(c, d.proximo.grupo, 10, COR.suave, "medio"); }
    } else {
      texto(c, d.habitos.total ? "Dia fechado" : "Sem hábitos hoje", compacto ? 13 : 15, COR.texto, "semi");
    }
  });
}

function blocoTarefas(pilha, d, limite) {
  return cartao(pilha, (c) => {
    rotulo(c, "checklist", d.tarefasTotal ? "Tarefas · " + d.tarefasTotal : "Tarefas", COR.azul);
    c.addSpacer(5);
    if (!d.tarefas.length) { texto(c, "Nada pendente", 11, COR.suave); return; }
    for (const t of d.tarefas.slice(0, limite)) {
      const l = c.addStack();
      l.centerAlignContent();
      icone(l, t.importante ? "exclamationmark.circle.fill" : "circle", 10, t.importante ? COR.aviso : COR.apagado);
      l.addSpacer(5);
      texto(l, t.titulo, 11, COR.texto, "medio");
      if (t.hora) { l.addSpacer(4); texto(l, t.hora, 10, COR.suave); }
      c.addSpacer(3);
    }
  });
}

function blocoAgenda(pilha, d, limite) {
  return cartao(pilha, (c) => {
    rotulo(c, "calendar", "Agenda", COR.aviso);
    c.addSpacer(5);
    if (!d.agenda.length) { texto(c, "Nada mais hoje", 11, COR.suave); return; }
    for (const a of d.agenda.slice(0, limite)) {
      const l = c.addStack();
      l.centerAlignContent();
      texto(l, a.hora, 10, COR.aviso, "semi");
      l.addSpacer(6);
      texto(l, a.titulo, 11, COR.texto, "medio");
      c.addSpacer(3);
    }
  });
}

function blocoMetas(pilha, d, largura) {
  return cartao(pilha, (c) => {
    rotulo(c, "target", "Metas do mês", COR.feito);
    c.addSpacer(6);
    for (const m of d.metas.slice(0, 3)) {
      const l = c.addStack();
      l.centerAlignContent();
      texto(l, m.titulo, 11, COR.texto, "medio");
      l.addSpacer();
      texto(l, m.texto, 10, COR.suave, "semi");
      c.addSpacer(3);
      if (m.pct !== null && m.pct !== undefined) barra(c, m.pct, largura, m.pct >= 1 ? COR.feito : COR.azul);
      c.addSpacer(5);
    }
  });
}

function cabecalho(w, d, comAnel) {
  const topo = w.addStack();
  topo.centerAlignContent();
  const esq = topo.addStack();
  esq.layoutVertically();
  texto(esq, d.dia, 15, COR.texto, "negrito");
  const sub = esq.addStack();
  sub.centerAlignContent();
  if (d.sequencia) {
    icone(sub, "flame.fill", 10, COR.aviso);
    sub.addSpacer(3);
    texto(sub, d.sequencia.dias + " dias · " + d.sequencia.nome, 10, COR.suave, "medio");
  } else {
    texto(sub, d.semAula ? "Sem aula hoje" : d.habitos.feitos + " de " + d.habitos.total + " hábitos", 10, COR.suave, "medio");
  }
  topo.addSpacer();
  if (comAnel) {
    const img = topo.addImage(anel(d.habitos.pct, 40, 5));
    img.imageSize = new Size(40, 40);
  }
}

// Hora em que os dados foram buscados: o iOS decide quando o widget atualiza, então mostramos a idade dos dados.
function atualizado(pilha, d) {
  const l = pilha.addStack();
  l.centerAlignContent();
  icone(l, "arrow.clockwise", 8, COR.apagado);
  l.addSpacer(3);
  texto(l, d.atualizado.replace(":", "h"), 9, COR.apagado, "medio");
  return l;
}

// ---------- Tamanhos ----------
function pequeno(d) {
  const w = new ListWidget();
  w.setPadding(12, 12, 12, 12);
  const topo = w.addStack();
  topo.centerAlignContent();
  const img = topo.addImage(anel(d.habitos.pct, 54, 6, d.habitos.feitos + "/" + d.habitos.total));
  img.imageSize = new Size(54, 54);
  topo.addSpacer();
  const lado = topo.addStack();
  lado.layoutVertically();
  texto(lado, d.dia.split(",")[0], 13, COR.texto, "negrito");
  texto(lado, d.dia.split(",")[1] ? d.dia.split(",")[1].trim() : "", 10, COR.suave, "medio");
  w.addSpacer();
  rotulo(w, "arrow.right.circle.fill", d.proximo ? "Próximo" : "Hábitos", d.proximo ? COR.feito : COR.suave);
  w.addSpacer(2);
  texto(w, d.proximo ? d.proximo.nome : (d.habitos.total ? "Dia fechado" : "Sem hábitos"), 13, COR.texto, "semi", 2);
  w.addSpacer(4);
  const rodape = w.addStack();
  rodape.centerAlignContent();
  texto(rodape, d.tarefasTotal ? d.tarefasTotal + (d.tarefasTotal === 1 ? " tarefa" : " tarefas") : "Sem tarefas", 10, COR.suave, "medio");
  rodape.addSpacer();
  atualizado(rodape, d);
  return w;
}

function medio(d) {
  const w = new ListWidget();
  w.setPadding(13, 14, 13, 14);
  const linha = w.addStack();
  linha.topAlignContent();
  const esq = linha.addStack();
  esq.layoutVertically();
  esq.size = new Size(104, 0);
  const img = esq.addImage(anel(d.habitos.pct, 66, 7, d.habitos.feitos + "/" + d.habitos.total));
  img.imageSize = new Size(66, 66);
  esq.addSpacer(6);
  texto(esq, d.dia, 12, COR.texto, "negrito");
  if (d.sequencia) {
    const s = esq.addStack(); s.centerAlignContent();
    icone(s, "flame.fill", 9, COR.aviso); s.addSpacer(2);
    texto(s, d.sequencia.dias + " dias seguidos", 9, COR.suave, "medio");
  }
  esq.addSpacer(4);
  atualizado(esq, d);
  linha.addSpacer(10);
  const dir = linha.addStack();
  dir.layoutVertically();
  blocoProximo(dir, d, true);
  dir.addSpacer(6);
  if (d.agenda.length && !d.tarefas.length) blocoAgenda(dir, d, 2); else blocoTarefas(dir, d, 2);
  return w;
}

function grande(d) {
  const w = new ListWidget();
  w.setPadding(15, 15, 13, 15);
  cabecalho(w, d, true);
  w.addSpacer(10);
  blocoProximo(w, d, false);
  w.addSpacer(8);
  const colunas = w.addStack();
  colunas.topAlignContent();
  const a = colunas.addStack(); a.layoutVertically();
  blocoTarefas(a, d, 4);
  colunas.addSpacer(8);
  const b = colunas.addStack(); b.layoutVertically();
  blocoAgenda(b, d, 4);
  if (d.metas.length) { w.addSpacer(8); blocoMetas(w, d, 270); }
  w.addSpacer();
  const pe = w.addStack();
  pe.centerAlignContent();
  icone(pe, "quote.opening", 9, COR.apagado);
  pe.addSpacer(4);
  texto(pe, d.frase, 10, COR.suave, "medio", 2);
  pe.addSpacer(6);
  atualizado(pe, d);
  return w;
}

function montar(d, familia) {
  const w = familia === "small" ? pequeno(d) : familia === "medium" ? medio(d) : grande(d);
  fundo(w);
  w.url = URL_APP;
  // Pede ao iOS para buscar de novo em 5 min (é um pedido: o iOS pode esperar mais, conforme a bateria e o uso).
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  return w;
}

function erro(mensagem) {
  const w = new ListWidget();
  fundo(w);
  w.url = URL_APP;
  w.setPadding(14, 14, 14, 14);
  rotulo(w, "exclamationmark.triangle.fill", "Cadeia", COR.aviso);
  w.addSpacer(6);
  texto(w, mensagem, 12, COR.suave, "medio", 4);
  return w;
}

async function buscar() {
  const req = new Request(URL_RESUMO);
  req.headers = { Authorization: "Bearer " + TOKEN };
  req.timeoutInterval = 15;
  const dados = await req.loadJSON();
  if (req.response.statusCode !== 200) throw new Error(dados.erro || "Erro " + req.response.statusCode);
  return dados;
}

const familia = config.widgetFamily || "large";
let widget;
try { widget = montar(await buscar(), familia); }
catch (e) { widget = erro("Não deu para carregar: " + e.message); }
if (config.runsInWidget) Script.setWidget(widget);
else if (familia === "small") await widget.presentSmall();
else if (familia === "medium") await widget.presentMedium();
else await widget.presentLarge();
Script.complete();
`;
}
