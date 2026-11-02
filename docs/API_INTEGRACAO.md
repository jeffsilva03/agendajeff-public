# API de integração do AgendaJeff (v1, somente leitura)

API REST privada para consultar os dados do AgendaJeff, e base do servidor MCP usado por assistentes de IA (ver [INTEGRACAO_CHATGPT.md](INTEGRACAO_CHATGPT.md)). A especificação OpenAPI está em [openapi.yaml](openapi.yaml).

- Prefixo: `/api/integrations/agenda/v1/`
- Só leitura: não existe nenhuma rota de gravação. `POST`, `PUT`, `PATCH` e `DELETE` respondem 405.
- Fuso de referência: `America/Sao_Paulo`. "Hoje" é sempre a data real de São Paulo; o `?data=` de desenvolvimento das telas **não** vale aqui.

---

## 1. Arquitetura

```
Rota HTTP (app/api/integrations/agenda/v1/*/route.ts)      Ferramenta MCP (lib/mcp/ferramentas.ts)
            │                                                         │
            └──────────────► lib/api/rota.ts  ◄── autenticação, interruptor, limite, erros
                                  │
             lib/api/parametros.ts (validação zod, estrita)
                                  │
             lib/api/servicos/*.ts (hoje, agenda/semana, tarefas, faculdade, hábitos, carreira, insights, busca)
                                  │
     motor compartilhado (supabase/functions/_shared/motor) + carregar.ts  ← as mesmas funções das telas
                                  │
            Supabase com o cliente NO CONTEXTO DO USUÁRIO (RLS do Postgres aplicada)
```

| Camada | Arquivos | Papel |
|---|---|---|
| Rotas | `app/api/integrations/agenda/v1/*/route.ts` | Só `GET`, uma linha cada: liga esquema + serviço. |
| Envelope | `lib/api/rota.ts` | Autentica, aplica o interruptor de integrações e o limite, valida, converte erros. |
| Autenticação | `lib/api/auth.ts` | Valida a credencial no Supabase Auth e cria o cliente do usuário. |
| Validação | `lib/api/parametros.ts` | Esquemas zod estritos (parâmetro desconhecido = 400), tetos de intervalo e paginação. |
| Serviços | `lib/api/servicos/*.ts` | Regras de consulta. Servem a API REST e o MCP. |
| Formatos | `lib/api/formatos.ts`, `lib/api/respostas.ts` | Contrato público (chaves em inglês, datas ISO 8601 com `-03:00`), envelope e erros. |
| Regras de negócio | `supabase/functions/_shared/motor/*` | As mesmas funções das telas. Para isso, alguns cálculos que estavam dentro das telas foram movidos para `motor/resumos.ts`: bloco da vez do Hoje, prazos do Hoje, progresso dos hábitos, resumo dos freelas, média de notas e semestre atual. As telas passaram a usar essas funções, sem mudança de comportamento. |

Não há banco paralelo, snapshot nem cache compartilhado: toda consulta lê o Supabase na hora. As respostas saem com `Cache-Control: private, no-store`.

---

## 2. Autenticação e permissões

A identidade vem **só** de uma credencial validada no servidor, nunca de parâmetro. Não existe `user_id` na API: um parâmetro desconhecido como esse é recusado com 400.

| Origem | Como chega | Quem usa | O que pode |
|---|---|---|---|
| `sessao` | Cookie de sessão do próprio app (sem cabeçalho `Authorization`) | O próprio AgendaJeff | Tudo de leitura, inclusive notas com `include=notes` |
| `token` | `Authorization: Bearer <access token de uma sessão do usuário>` | Ferramentas do próprio usuário (curl, testes) | Igual à sessão |
| `oauth` | `Authorization: Bearer <access token OAuth>` emitido pelo servidor OAuth 2.1 do Supabase a um cliente externo, com a claim `client_id` | ChatGPT e outros clientes MCP | Toda a leitura, inclusive as anotações, e só com as integrações ligadas em Ajustes |

Como cada credencial é validada:

- **Bearer:** o token é verificado no Supabase Auth com `auth.getUser(token)`. Isso confere assinatura, expiração e se a sessão continua ativa: token de sessão encerrada ou de concessão OAuth revogada é recusado. Depois, a API confere as claims `sub`, `role=authenticated` e `aud` (`authenticated` ou `MCP_RESOURCE_URL`). Também confere `iss`, se `SUPABASE_JWT_ISSUER` estiver definido.
- **Cookie:** `auth.getUser()` valida a sessão no Auth; não basta o cookie existir.

Todas as consultas usam um cliente Supabase criado com o token do usuário e a chave publishable. A RLS do Postgres continua decidindo o que cada um enxerga. A API **não usa** `service_role` nem a secret key.

### Restrições no banco para clientes OAuth

Ficam na migration `supabase/migrations/20261012180000_api_integracoes.sql`:

- **Políticas RESTRICTIVE em todas as tabelas:** um token com `client_id` não consegue `insert`, `update` nem `delete`, mesmo se usar o Supabase direto em vez da API.
- **Tabelas internas:** um token com `client_id` também não consegue ler `profiles` (que guarda o token do calendário), `push_subscriptions`, `notification_log`, `reminder_slots` e `pendencias`. A API pega os campos do perfil que precisa pela função `api_perfil()`.
- **Reflexões liberadas (20/10/2026):** a pedido do usuário, a migration `20261020120000_integracoes_leem_reflexoes.sql` removeu o bloqueio de leitura do Raio-X (`raiox_meses`, `raiox_notas`), da revisão mensal (`revisoes_mensais`) e das frases dos lembretes (`frases`). O bloqueio de gravação continua.
- **Interruptor:** `profiles.integracoes_ativas` começa em `false`. Com ele desligado, qualquer token OAuth recebe 403 `integracao_desativada`, tanto na API quanto no MCP.
- **Tabela nova no futuro:** o laço da migration já cobriu as tabelas existentes. Uma tabela criada depois precisa das mesmas três políticas `oauth nao grava (...)`.

### Anotações

Desde 20/10/2026, o usuário liberou toda a agenda para os aplicativos que ele autorizar, inclusive as anotações.

- **REST:** as notas dos registros de hábito, das tarefas e das candidaturas e as descrições de freelas e de avaliações continuam saindo só com `include=notes`, para as respostas ficarem menores. O parâmetro agora vale para qualquer origem, inclusive OAuth.
- **MCP:** as ferramentas já entregam as anotações, sem parâmetro.
- **Projetos e Mês:** o detalhe do projeto (`/projects/{id}`) traz descrição e anotações, e `/month` traz a revisão mensal completa, para qualquer origem.
- **Notas das avaliações:** as notas das provas e as médias saem só com `include=grades` no REST, ou `includeGrades=true` no MCP.

### Limite de uso

São 60 consultas por minuto por usuário e por cliente (o app conta como `app`; cada cliente OAuth separado). O controle fica no banco, na função `api_registrar_uso()`, que tira a identidade do JWT, nunca de parâmetro.

Ao passar do limite, a resposta é 429 `limite_excedido`, com `Retry-After`. Toda resposta traz `RateLimit-Limit` e `RateLimit-Remaining`. A mesma função guarda o último uso por cliente, mostrado em Ajustes.

---

## 3. Formato das respostas

Resposta de sucesso:

```json
{
  "success": true,
  "data": { "...": "..." },
  "meta": {
    "timezone": "America/Sao_Paulo",
    "generatedAt": "2026-10-12T16:40:00-03:00",
    "source": "AgendaJeff",
    "apiVersion": "v1",
    "requestId": "uuid",
    "pagination": { "limit": 50, "offset": 0, "total": 3, "hasMore": false }
  }
}
```

`pagination` só aparece nas listas paginadas.

Resposta de erro:

```json
{ "success": false, "error": { "code": "parametro_invalido", "message": "Parâmetros inválidos.", "details": [{ "param": "end", "message": "intervalo máximo de 62 dias" }] }, "meta": { "requestId": "uuid", "apiVersion": "v1" } }
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `parametro_invalido` | Parâmetro desconhecido, repetido, data inexistente, intervalo grande demais, paginação fora do limite |
| 401 | `nao_autenticado` | Sem credencial (com `WWW-Authenticate: Bearer`) |
| 401 | `token_invalido` | Credencial inválida, expirada ou revogada |
| 403 | `integracao_desativada` | Cliente OAuth com as integrações desligadas em Ajustes |
| 404 | `nao_encontrado` | `habitId` ou projeto que não existe (ou não é do usuário) |
| 405 | (sem corpo) | Método de gravação |
| 429 | `limite_excedido` | Acima de 60 consultas por minuto |
| 500 | `erro_interno` | Falha técnica. Não vira lista vazia, e a mensagem não expõe detalhes internos. O log registra só a rota, o `requestId` e a mensagem técnica, nunca token nem conteúdo pessoal. |

Para não confundir os casos:

- **Nenhum registro:** lista vazia com `success: true`.
- **Dado indisponível:** campo `null` explícito (ex.: `currentSemester: null` quando nenhum semestre está em andamento, com o mais recente em `mostRecentSemester`).
- **Estatística ainda sem dados suficientes:** `{ "available": false, "reason": "insufficient_data", "requiredDays": 14, "missingDays": 9 }`.

Valores e códigos que aparecem nas respostas:

- **Status de hábito:** `done` (feito), `minimum` (mínimo, conta como feito), `not_done`, `not_applicable` (não conta como falha), `pending`.
- **Estados do histórico:** os mesmos, mais `not_marked` (o dia teve registros, mas o hábito não foi marcado; conta como não feito) e `no_records` (o dia não teve nenhum registro; fica fora da adesão e quebra a sequência).
- **Origem dos itens da agenda (`source`):** `event`, `freelance`, `college` (provas, trabalhos e atividades) ou `application` (próxima etapa de candidatura). O motor junta tudo, sem duplicar.

---

## 4. Endpoints

Todas as rotas são `GET`. Os detalhes de cada campo estão no [openapi.yaml](openapi.yaml).

| Rota | Finalidade | Auth | Filtros |
|---|---|---|---|
| `/health` | Disponibilidade (sem dados de usuário, versão interna ou configuração) | Nenhuma | — |
| `/today` | Dia completo, com a lógica da tela Hoje | Sim | `date`, `include=notes` |
| `/agenda` | Agenda dia a dia | Sim | `start`, `end` (obrigatórios, até 62 dias) |
| `/tasks` | Tarefas | Sim | `date` ou `start`+`end`, `status` (pending, done, all), `overdue`, `important`, `recurring`, `include=notes`, `limit` (até 100), `offset` |
| `/college` | Faculdade (inclui as faltas e `classroomAssignments`: atividades do Google Classroom com o estado efetivo. `status`: `pending` (ainda pede ação), `delivered` (entregue ou devolvida no Classroom) ou `resolved_locally` (concluída no AgendaJeff ou dispensada). Também traz `officialSituation`, `localResolution` (`completed` ou `dismissed`) e `needsReview`. `assessments=pending` traz só as que pedem ação; `delivered` traz as outras.) | Sim | `date`, `assessments` (pending, delivered, all), `type` (prova, trabalho, atividade), `semester` (current, all), `include=grades,notes` |
| `/habits` | Hábitos e progresso | Sim | `date`, `start`+`end` (até 92 dias), `habitId` |
| `/applications` | Candidaturas | Sim | `status` (lista), `upcoming`, `include=notes`, `limit`, `offset` |
| `/freelances` | Freelas | Sim | `status` (lista; sem filtro, os cancelados ficam de fora como na tela), `include=notes`, `limit`, `offset` |
| `/projects` | Projetos com status, prioridade, tecnologias, próximo passo, prazo e progresso das features (geral e do MVP) | Sim | `status` (lista: ideia, planejando, desenvolvendo, pausado, concluido, arquivado; sem filtro, os arquivados ficam de fora), `limit`, `offset` |
| `/projects/{id}` | Um projeto completo: descrição, problema, público, anotações, links, datas e todas as features | Sim | — |
| `/month` | Metas do mês com progresso, Raio-X da vida e revisão mensal com os números | Sim | `month` (AAAA-MM, até 24 meses para cada lado; padrão: o atual) |
| `/week` | Semana consolidada | Sim | `date` (qualquer dia da semana; sem data, a semana do Planejar a semana: no fim de semana, a próxima) |
| `/insights` | Análises da tela Insights | Sim | — |
| `/search` | Busca por título ou nome | Sim | `q` (2 a 60 caracteres), `categories` (tasks, events, habits, college, applications, freelances, projects), `limit` (até 50), `offset` (até 500) |

### Regras de negócio respeitadas

Todas vêm das mesmas funções usadas pelas telas.

- **Dia:** `resolverDia` decide quais cadeias valem, hábitos flexíveis, aulas (só dentro do semestre e sem feriado ou "sem aula"), compromissos, prazos e lembretes, e colisões com a janela das cadeias. Feriado nacional em dia útil vira "sem aula", a não ser que tenha sido desfeito.
- **Hoje:** o "bloco da vez" (`blocoDaVez`), a lista de prazos (`prazosDoHoje`, horizonte de 45 dias) e a ordem das tarefas (importantes primeiro, depois por horário) são os mesmos da tela.
- **Tarefas:**
  - Uma tarefa não concluída passa para os dias seguintes como atrasada (`overdue`, com `overdueSince`).
  - Uma recorrente não acumula: em consulta de intervalo, as instâncias aparecem só de hoje em diante. Uma instância ainda não concluída vem com `id: null` e `recurringTaskId`.
  - Concluída nunca aparece como pendente.
- **Hábitos:**
  - Adesão = (feito + mínimo) / dias em que o hábito valia.
  - "Não se aplica", dias em que o hábito não valia e dias sem nenhum registro ficam fora da adesão. Dia sem registro quebra a sequência. Hoje ainda pendente não conta contra.
  - A meta de referência é de 66 dias.
- **Insights:** os limiares em dias com registro são os da tela: adesão 7, quebra 10, período 14, dia da semana 21 e hábitos que andam juntos 21.
- **Freelas:**
  - A receber = soma dos freelas com status Entregue. Recebido = Pago.
  - As horas do mês contam os registros do mês corrente.
  - Os estados são Proposta, Em andamento, Entregue, Pago e Cancelado.
- **Projetos:** progresso = features feitas / total; MVP = só as features **essenciais**. A lista segue a ordem da tela (fixados, depois em desenvolvimento, prioridade e o mexido por último) e as features, a ordem de trabalho (fazendo, a fazer com as essenciais antes, feitas no fim).
- **Mês:** o progresso e a situação das metas (no caminho, atrás, concluída, encerrada) e os números da revisão mensal usam `progressoMeta` e `resumoDoMes`, como a página Mês. No Raio-X, gap = importância − ação, e o quadrante corta na nota 6.
- **Candidaturas:**
  - "Aguardando resposta" = status Enviada.
  - Uma próxima etapa só conta se tiver data a partir de hoje e a candidatura não estiver encerrada (Recusada ou Desisti).

### Limitações conhecidas

- **Registros offline:** um registro feito sem conexão e ainda na fila do aparelho não aparece na API até sincronizar. A API só mostra o que está gravado no servidor.
- **Busca:** procura em títulos e nomes (nos projetos, também no resumo e nas features), não no texto das anotações. O caractere `*` é removido do termo, porque o PostgREST o usa como curinga e não há como escapá-lo.
- **Hoje:** "hoje" é a data real de São Paulo. Para consultar outro dia, use `date`.
- **Ataque sem credencial:** o limite de uso vale por usuário autenticado. Uma enxurrada de requisições sem credencial bate primeiro no Supabase Auth, que tem os próprios limites. Se for preciso, dá para somar a proteção do firewall da Vercel.
- **Contas sem acompanhamento:** se `inicio_rastreamento` estiver vazio, o acompanhamento começa no próprio dia.

---

## 5. Exemplos

```bash
# Disponibilidade
curl https://agenda.example.com/api/integrations/agenda/v1/health

# Com um token (ex.: o access token de uma sessão sua ou de um cliente OAuth)
curl -H "Authorization: Bearer $TOKEN" "https://agenda.example.com/api/integrations/agenda/v1/today"
curl -H "Authorization: Bearer $TOKEN" "https://agenda.example.com/api/integrations/agenda/v1/agenda?start=2026-10-17&end=2026-10-17"
curl -H "Authorization: Bearer $TOKEN" "https://agenda.example.com/api/integrations/agenda/v1/tasks?overdue=true"
curl -H "Authorization: Bearer $TOKEN" "https://agenda.example.com/api/integrations/agenda/v1/college?assessments=pending&type=prova"
curl -H "Authorization: Bearer $TOKEN" "https://agenda.example.com/api/integrations/agenda/v1/habits?date=2026-10-11"
```

Trecho de `/today` (dados fictícios):

```json
{
  "date": "2026-10-14", "weekday": "wednesday", "isToday": true, "localTime": "09:12",
  "classDay": { "isClassDay": true, "hasClass": true, "noClassReason": null },
  "classes": [{ "subject": "Disciplina X", "startTime": "18:30", "endTime": "22:50", "start": "2026-10-14T18:30:00-03:00", "room": null }],
  "events": [{ "source": "event", "title": "Reunião", "startTime": "13:00", "start": "2026-10-14T13:00:00-03:00", "location": "Café" }],
  "conflicts": [{ "chainName": "Tarde", "title": "Reunião", "message": "Reunião às 13h colide com a cadeia Tarde" }],
  "habits": { "summary": { "scheduled": 9, "done": 3, "doneMinimum": 1, "notApplicable": 0, "pending": 6 } },
  "tasks": { "pending": [{ "title": "Imprimir trabalho", "time": "15:00", "important": true, "overdue": false }], "overdue": [], "done": [] }
}
```

---

## 6. Rodar e testar localmente

```bash
npx supabase start                       # Docker Desktop aberto
npx supabase migration up --local        # aplica a migration da API (ou db reset)
npm run dev                              # app em http://localhost:3000
```

Pontos do ambiente local:

- O `supabase/config.toml` local já liga o servidor OAuth (`[auth.oauth_server] enabled = true`, consentimento em `/oauth/consent`, registro dinâmico ligado) e usa `site_url = http://localhost:3000`.
- Se a URL do app no `.env.local` usar o IP da rede, defina `SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1`.

Testes:

| Comando | O que cobre |
|---|---|
| `npm test` | Vitest: motor (incluindo `motor/resumos.ts`), validação de parâmetros, escape da busca, formatos de data e hora |
| `npx playwright test integracoes` | API e OAuth/MCP contra o app local. A suíte cria contas próprias de teste (`e2e-api@`, `e2e-outro@`), com dados fictícios, e apaga tudo no fim. Detalhes abaixo. |
| `bash scripts/e2e-producao.sh integracoes --grep-invert OAuth` | A mesma suíte contra o build de produção (porta 3100). |
| `npm run test:e2e` | Suíte completa |

A suíte `integracoes` verifica:

- **Autenticação:** sem credencial, token inválido, malformado, expirado e de sessão encerrada.
- **Regras das telas:** Hoje, hábitos (feito, mínimo, não se aplica), tarefas atrasadas e recorrentes, aulas dentro e fora do semestre, prazos sem duplicar, candidaturas, freelas, projetos (lista, detalhe e progresso do MVP), mês (metas, Raio-X e revisão), semana, agenda, insights sem dados suficientes e busca.
- **Isolamento e limites:** entre usuários (na API e direto no banco), métodos de gravação (405) e limite (429).
- **OAuth completo:** registro dinâmico, PKCE, consentimento negado e permitido, troca de código.
- **Token OAuth:** lê as anotações e a revisão mensal, mas não grava nada e não lê as tabelas internas do banco.
- **MCP:** inicialização, lista de ferramentas e chamadas (incluindo projetos e mês).
- **Interruptor e revogação:** desligar em Ajustes bloqueia na hora, e revogar invalida o token.

Se o login de teste der erro por excesso de tentativas, é o limite do Supabase local: 30 logins a cada 5 minutos.

---

## 7. Publicar

São necessárias as etapas abaixo. Todas dependem de autorização do dono do projeto, porque mexem em produção.

1. **Banco:** `npx supabase db push --linked` aplica `20261012180000_api_integracoes.sql`. A migration é aditiva: acrescenta uma coluna com padrão `false`, políticas, duas tabelas de uso e duas funções.
2. **Servidor OAuth no Supabase da nuvem:** em Authentication → OAuth Server, ligar o servidor OAuth 2.1, definir o Authorization Path como `/oauth/consent` e ligar o registro dinâmico se o cliente precisar (o ChatGPT usa). A Site URL já é `https://agenda.example.com`.
3. **Vercel:** cadastrar `MCP_RESOURCE_URL=https://agenda.example.com/mcp`. `SUPABASE_JWT_ISSUER` é opcional na nuvem, porque o padrão já bate com o emissor.
4. **Código:** fazer merge da branch na `main`; a Vercel publica sozinha.
5. **Uso:** o usuário liga **Ajustes → Integrações externas** quando quiser. Começa desligado.

Revogação:

- **Um cliente:** Ajustes → Integrações externas → Revogar. Isso apaga as sessões e os refresh tokens daquele cliente.
- **Todos de uma vez:** desligar o interruptor. A concessão continua registrada, mas nenhuma consulta passa.
- **Clientes registrados:** no painel do Supabase (Authentication → OAuth Apps), dá para apagar um cliente.

Custos: nenhum serviço novo. O servidor OAuth do Supabase está em beta, sem cobrança separada, em todos os planos; logins por cliente contam no limite de usuários ativos, mas o mesmo usuário conta uma vez só. O MCP roda nas funções da própria Vercel, sem Redis.
