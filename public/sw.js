// Service worker do Cadeia.
// - Offline: páginas do app em "rede primeiro, cache se falhar" (abre no trem sem sinal);
//   arquivos estáticos do Next em cache permanente (nomes têm hash).
// - Push: mostra a notificação, atualiza o ícone e abre o Hoje no período certo.
// - Em desenvolvimento (/sw.js?dev=1): só push, sem cache nenhum (o dev reaproveita nomes de arquivo).
const VERSAO = "cadeia-v5";
const DEV = new URL(self.location.href).searchParams.has("dev");
const CACHE_PAGINAS = `${VERSAO}-paginas`;
const CACHE_ESTATICOS = `${VERSAO}-estaticos`;
const ROTAS_APP = ["/hoje", "/habitos", "/agenda", "/freelas", "/insights", "/ajustes"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const nome of await caches.keys()) if (DEV || !nome.startsWith(VERSAO)) await caches.delete(nome);
  await self.clients.claim();
})()));

const paginaOffline = () => new Response(
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sem conexão</title><body style="font-family:system-ui;background:#0d0f12;color:#e7e9ee;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center">
  <div><h1 style="font-size:20px">Sem conexão</h1><p style="color:#8c95a3">Esta tela ainda não foi aberta com internet neste aparelho.<br>Abra o Hoje uma vez com sinal para ele funcionar offline.</p>
  <p><a href="/hoje" style="color:#7c8aff">Tentar o Hoje</a></p></div></body></html>`,
  { headers: { "Content-Type": "text/html; charset=utf-8" } });

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (DEV || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e afins: sempre rede

  // Estáticos com hash: cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_ESTATICOS);
      const salvo = await cache.match(req);
      if (salvo) return salvo;
      const resp = await fetch(req);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    })());
    return;
  }

  // Navegação nas telas do app: rede primeiro; sem rede (ou mais de 8 s), a versão salva
  // do mesmo endereço ou, na falta dela, a última versão salva da mesma tela.
  const ehPagina = req.mode === "navigate" && ROTAS_APP.some((r) => url.pathname === r || url.pathname.startsWith(`${r}/`));
  if (!ehPagina) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_PAGINAS);
    const exata = url.pathname + url.search;
    try {
      const resp = await Promise.race([
        fetch(req),
        new Promise((_, rej) => setTimeout(() => rej(new Error("lenta")), 8000)),
      ]);
      if (resp.ok && !resp.redirected) {
        await cache.put(exata, resp.clone());
        await cache.put(`${url.pathname}?__ultima=1`, resp.clone());
      }
      return resp;
    } catch {
      return (await cache.match(exata)) ?? (await cache.match(`${url.pathname}?__ultima=1`)) ?? paginaOffline();
    }
  })());
});

self.addEventListener("push", (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch { dados = { title: "Cadeia", body: event.data?.text() }; }
  const titulo = dados.title || "Cadeia";
  const tarefas = [
    self.registration.showNotification(titulo, {
      body: dados.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: `cadeia-${titulo}`,
      renotify: true,
      data: { url: dados.url || "/hoje" },
    }),
  ];
  // Badging API (Windows/Chrome/Edge instalados; iOS 16.4+ instalado)
  if (typeof dados.pendentes === "number" && self.navigator.setAppBadge) {
    tarefas.push(dados.pendentes > 0 ? self.navigator.setAppBadge(dados.pendentes) : self.navigator.clearAppBadge());
  }
  event.waitUntil(Promise.all(tarefas).catch(() => {}));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/hoje", self.location.origin).href;
  event.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.navigate(destino).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(destino);
  })());
});

// ---------- Widget do Windows 11 (painel de Widgets, PWA instalado pelo Edge) ----------
// O painel só mostra o widget quando o service worker manda template + dados (Adaptive Card).
async function atualizarWidget(widget) {
  if (!widget) return;
  const definicao = widget.definition;
  const [template, dados] = await Promise.all([
    fetch(definicao.msAcTemplate, { cache: "no-store" }).then((r) => r.text()),
    fetch(definicao.data, { cache: "no-store", credentials: "same-origin" }).then(async (r) => r.ok
      ? r.text()
      : JSON.stringify({ titulo: "Cadeia", habitos: "", proximo: "Abra o app e entre na sua conta para ver o dia aqui.", tarefasTitulo: "", tarefas: [], agenda: [], metas: [], temMetas: false, sequencia: "", frase: "", atualizado: "" })),
  ]);
  await self.widgets.updateByTag(definicao.tag, { template, data: dados });
}

async function atualizarTodosWidgets() {
  if (!self.widgets) return;
  const instalados = await self.widgets.matchAll({ installed: true });
  await Promise.all(instalados.map(atualizarWidget));
}

self.addEventListener("widgetinstall", (event) => {
  event.waitUntil((async () => {
    // Atualização periódica (o painel não atualiza sozinho), no intervalo do manifest.
    if (self.registration.periodicSync) {
      const tags = await self.registration.periodicSync.getTags();
      if (!tags.includes(event.widget.definition.tag)) {
        await self.registration.periodicSync.register(event.widget.definition.tag, { minInterval: (event.widget.definition.update || 1800) * 1000 }).catch(() => {});
      }
    }
    await atualizarWidget(event.widget);
  })());
});

self.addEventListener("widgetresume", (event) => event.waitUntil(atualizarWidget(event.widget)));

self.addEventListener("widgetuninstall", (event) => {
  event.waitUntil((async () => {
    if (self.registration.periodicSync && event.widget.instances.length <= 1) {
      await self.registration.periodicSync.unregister(event.widget.definition.tag).catch(() => {});
    }
  })());
});

self.addEventListener("widgetclick", (event) => {
  if (event.action === "atualizar") event.waitUntil(atualizarWidget(event.widget));
  else event.waitUntil(self.clients.openWindow("/hoje"));
});

self.addEventListener("periodicsync", (event) => {
  if (!self.widgets) return;
  event.waitUntil(self.widgets.getByTag(event.tag).then(atualizarWidget));
});

// Ao ativar uma versão nova do service worker, e quando chega um push (algo mudou no dia), atualiza o widget.
self.addEventListener("activate", (event) => event.waitUntil(atualizarTodosWidgets().catch(() => {})));
self.addEventListener("push", (event) => event.waitUntil(atualizarTodosWidgets().catch(() => {})));
