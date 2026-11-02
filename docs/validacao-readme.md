# Validação da documentação — Agenda Jeff

Verificações da base revisada em 02/11/2026, Windows, Node.js 22.22.0. Dependências instaladas com `npm ci --ignore-scripts` em cópia isolada.

| Verificação | Resultado |
| :-- | :-- |
| `npm test` | 13 arquivos e 127 testes passaram, usando fixture fictícia |
| `npm run typecheck` | Passou após adicionar `next typegen` antes de `tsc --noEmit` |
| `npm run lint` | Passou |
| `npm run build` | Compilou e gerou páginas, mas terminou com código 1 por alerta crítico de segurança do Next.js; não considerado aprovado |
| `npm audit --json` | 29 alertas: 1 crítico, 6 altos, 21 moderados e 1 baixo |
| Links locais, âncoras e assets do README | Conferidos por script e prévia local |
| Docker / Supabase local | Docker instalado, porém engine parada; E2E, seed contra banco e verificação RLS não executados |

O primeiro `tsc --noEmit` em clone limpo não encontrava `PageProps`, `LayoutProps` e `RouteContext`, pois os tipos de rotas ainda não haviam sido gerados. O script foi ajustado segundo `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`.

O build usou somente URL local e chave publicável fictícia, sem acesso ao banco pessoal. Não foram exercitados OAuth/Classroom, notificações reais, produção, sequência Linux/macOS ou fluxos E2E. A suíte E2E foi atualizada para consumir o seed fictício explicitamente, mas precisa ser executada com Supabase local antes de afirmar sua aprovação.

## Exportação pública

A versão pública foi criada em histórico novo. Nomes, links e guias foram adaptados; fixtures do Classroom usam identificadores fictícios. Verificações desta exportação e seus limites constam em `docs/versao-publica.md`. Os resultados anteriores não certificam deploy, OAuth, notificações ou E2E nesta cópia.

Nesta cópia pública, 127 testes passaram; o teste do widget também foi executado após a troca da origem por um domínio de exemplo (5 cenários). Typecheck passou. O lint foi executado novamente após os ajustes de textos. E2E, build e serviços externos não foram reexecutados; o alerta de build da base permanece documentado.
