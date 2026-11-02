# Integração AgendaJeff ↔ APIClassroom (Google Classroom)

Somente leitura. O AgendaJeff consome a **APIClassroom** (já publicada em `https://apiclassroom.vercel.app`) pelo
backend. Não fala com as APIs do Google, não usa as credenciais Google da APIClassroom e não usa o token do ChatGPT.

Contratos conferidos no código da APIClassroom, commit `6c4ebe6` (`classroom_app/app.py`, `activities.py`,
`courses.py`, `security.py`, `config.py`). Se a APIClassroom mudar, conferir de novo esta página e `lib/classroom/tipos.ts`.

## 1. Arquitetura

```text
Navegador (AgendaJeff)  ──sessão Supabase──►  Rotas /api/classroom/* (Next.js, servidor)
                                                 │  valida a sessão, a conta e a origem
                                                 │  lê/renova tokens cifrados (service role)
                                                 ▼
                                   APIClassroom (REST, Bearer do Auth0)  ──► Google Classroom
                                                 │
                                                 ▼
                         Supabase do AgendaJeff: classroom_* (snapshot + campos pessoais)
                                                 │
                         carregarContexto() ─────┴──► agenda, Hoje, Semana, lembretes, .ics, API/MCP
pg_cron (a cada 3 h) ──► /api/classroom/cron (segredo) ──► mesma sincronização
```

- **Google Classroom** é a fonte da verdade do que é oficial: título, descrição, prazo, estado da entrega e nota.
- **AgendaJeff** é a fonte da verdade do planejamento: andamento pessoal, prioridade, anotações, data para começar e vínculo com avaliação.
- **Agenda:** os prazos entram pela mesma agregação das avaliações. `carregarContexto` (em `supabase/functions/_shared/carregar.ts`) converte as atividades em eventos de prazo (`classroomParaEvento`, em `motor/classroom.ts`). Por isso aparecem, sem código extra, em todos estes lugares:
  - Hoje;
  - Agenda (semana e mês);
  - Planejar a semana;
  - lembretes (Edge Function `lembretes`);
  - feed `.ics`;
  - API e MCP.

## 2. Autenticação (Opção A: Authorization Code + PKCE)

A APIClassroom aceita um token do Auth0 dela (`seu-tenant.us.auth0.com`) se ele atender a tudo isto:

- assinatura RS256 conferida no JWKS;
- `iss` do tenant;
- `aud = https://apiclassroom.vercel.app/mcp`;
- `exp`;
- `sub` igual ao `MCP_OWNER_SUB` (o dono);
- escopo `classroom:read`.

Ela **não** restringe qual aplicativo pediu o token. Então um aplicativo próprio do AgendaJeff no mesmo tenant, com login do dono, funciona **sem nenhuma mudança na APIClassroom** e sem enfraquecer a verificação.

Fluxo:

1. **`GET /api/classroom/conectar`:**
   - exige a sessão do AgendaJeff;
   - gera o `state` e o verificador PKCE e guarda os dois num cookie httpOnly cifrado (10 min, só no caminho do retorno);
   - redireciona para `/authorize` com estes parâmetros: `scope=openid offline_access classroom:read`, `audience` da APIClassroom e `code_challenge` S256.
2. **`GET /api/classroom/callback`:**
   - confere o `state` e o usuário;
   - troca o código no `/oauth/token`, com o verificador e o `client_secret`;
   - **valida o token como a APIClassroom valida** (jose: JWKS, emissor, audiência e escopo);
   - faz **uma chamada real** a `/disciplinas` (só o dono recebe 200) e só então grava a conexão.
3. **Tokens:**
   - access e refresh ficam em `classroom_tokens`, cifrados com AES-256-GCM (chave `CLASSROOM_TOKEN_KEY`, só no servidor);
   - o AAD amarra cada token ao usuário;
   - a tabela tem RLS sem nenhuma política, e o `select` foi revogado de `anon` e `authenticated`. Só o service role lê.
4. **Renovação:** automática quando falta menos de 2 minutos, ou depois de um 401, por refresh token. Um refresh negado (`invalid_grant`) marca a conexão como **Reconexão necessária**.
   - **Rotação:** cada renovação grava o refresh token novo no lugar do anterior. A gravação tenta de novo antes de desistir, porque o antigo já não vale no Auth0.
   - **Concorrência:** com rotação, reusar um refresh token já trocado faz o Auth0 revogar toda a família. Por isso há duas proteções:
     - no mesmo processo, uma renovação por vez (quem chega espera a mesma promessa);
     - entre processos (sincronização, detalhe, cron), uma trava no banco: `classroom_tokens.renovacao_iniciada_em`, com atualização condicional por `atualizado_em`. Quem não pega a trava espera e relê o token gravado pelo outro.
   - **401 com token já renovado:** se outro processo já renovou, o token novo é usado sem nova renovação.
   - **Teste:** o e2e cobre isso com um token expirado e três pedidos simultâneos: uma renovação só e nenhuma revogação.
5. **`POST /api/classroom/desconectar`:** revoga o refresh token no Auth0 (`/oauth/revoke`) e apaga os tokens. As atividades ficam, e com `{"apagarDados": true}` são apagadas também.

O token nunca vai para o navegador. Os logs registram só mensagens técnicas, sem token e sem conteúdo.

### Configuração no Auth0 (feita pelo dono, uma vez)

1. **Applications → Create Application:** tipo **Regular Web Application**, nome **AgendaJeff**.
2. **Settings:**
   - **Allowed Callback URLs:** `https://agenda.example.com/api/classroom/callback`. Para testar localmente, inclua também `http://localhost:3000/api/classroom/callback`.
   - **Allowed Logout URLs** e **Web Origins:** podem ficar vazios.
3. **Advanced Settings → Grant Types:** marque **Authorization Code** e **Refresh Token**.
4. **Refresh Token Rotation:** pode ligar. O app guarda o novo refresh a cada renovação e evita renovações simultâneas. Como folga extra, um **Reuse Interval** de alguns segundos (ex.: 10) no Auth0 é aceitável.
5. **APIs:** na API cujo identificador é `https://apiclassroom.vercel.app/mcp`, ligue **Allow Offline Access**. Sem isso, não vem refresh token e o acesso cai em cerca de 1 hora.
6. **Login:** use a **mesma conta** (a mesma conexão, por exemplo Google) com que você entra no ChatGPT para a APIClassroom, para o `sub` ser o do dono.
7. Copie o **Domain**, o **Client ID** e o **Client Secret** para as variáveis da Vercel (seção 9). Não cole no chat nem no repositório.

## 3. Endpoints da APIClassroom usados

| Endpoint | Uso | Paginação |
|---|---|---|
| `GET /disciplinas?incluir_arquivadas=false&tamanho=100` | Lista de turmas (atualiza nomes, estado e aliases) | `pagina` ← `proxima_pagina` |
| `GET /disciplinas/{id}/atividades?tamanho=50&ordenacao=atualizadas` | Atividades publicadas | `pagina` ← `proxima_pagina` |
| `GET /disciplinas/{id}/entregas?tamanho=50` | Submissões próprias (uma vez por turma, sem N+1) | `pagina` ← `proxima_pagina` |
| `GET /disciplinas/{id}/atividades/{aid}` | Descrição completa e anexos, só ao abrir um cartão cuja descrição veio cortada | — |

O `/mcp` e o `/pesquisa/atividades` não são usados. O filtro `criadas_desde` não serve para detectar mudanças.

**Proteções do cliente** (`lib/classroom/cliente.ts`):

- URL base fixa em produção (sem SSRF);
- identificadores validados (`[A-Za-z0-9_-]`);
- cursor validado e sem repetição, com no máximo 40 páginas;
- timeout de 25 s por chamada;
- tentativas com espera em 429, 5xx e rede (respeita `Retry-After`);
- uma renovação de token em 401.

## 4. Banco (migration `20261021120000_classroom.sql`)

| Tabela | Conteúdo | Quem escreve |
|---|---|---|
| `classroom_conexoes` | Estado da conexão, `sub`, trava da sincronização, última sincronização, resultado, `auto_sync` | Servidor. O dono altera só `auto_sync`. |
| `classroom_tokens` | Access e refresh cifrados, expiração e escopo | Só o servidor (sem política, sem `select` para usuários) |
| `classroom_turmas` | Turmas vistas (nome, estado, aliases, link) e a escolha do usuário (`acompanhar`, `nome_exibicao`, `disciplina_id`) | Servidor nos dados oficiais. O dono altera só as 3 colunas de escolha. |
| `classroom_atividades` | Snapshot oficial, controle de mudanças (`mudou_em`, `mudancas`, `prazo_anterior`, `visto_em`, `ausente_desde`) e campos pessoais (`status_pessoal`, `prioridade`, `notas_pessoais`, `inicio_planejado`, `avaliacao_id`) | Servidor nos dados oficiais. O dono altera só os 5 campos pessoais. |
| `classroom_sincronizacoes` | Histórico das execuções (origem, resultado, resumo, erros) | Servidor |

**Integridade:**

- `UNIQUE (user_id, source, course_id, activity_id)` com `source = 'google_classroom'`;
- `UNIQUE (user_id, course_id)` nas turmas;
- checagens de estado e precisão;
- gatilho que impede vincular disciplina ou avaliação de outro usuário;
- índices por usuário e turma, e por prazo.

**Permissões:**

- RLS de leitura só do dono;
- `insert`, `update` e `delete` revogados de `anon` e `authenticated`, com `update` liberado **por coluna** apenas nos campos pessoais e de escolha;
- clientes OAuth (ChatGPT) leem como dono, mas não gravam.

## 5. Estados (o que vale para cada atividade)

| `entrega_estado` (studentSubmissions) | Situação no painel | Agenda e lembretes |
|---|---|---|
| `NEW`, `CREATED`, `RECLAIMED_BY_STUDENT`, com prazo futuro ou sem prazo | Pendente | Sim, se tiver prazo |
| Os mesmos, com prazo passado ou `atrasada_segundo_google=true` | Atrasada | Sim |
| `TURNED_IN` | Entregue | Não |
| `RETURNED` | Devolvida (mostra a nota; não presume reenvio) | Não |
| Nulo ou desconhecido | Status não confirmado | Sim, com o aviso "entrega não confirmada" |

- `PUBLISHED` nunca é tratado como pendente.
- Nota `0` é nota. Nota `null` é "sem nota lançada".
- O andamento pessoal (`status_pessoal`: a fazer, fazendo, pronto para enviar) é separado do estado oficial e nunca é sobrescrito pela sincronização.

### 5.1. Decisão pessoal (só no AgendaJeff)

Migration `20261022100000_classroom_resolucao_local.sql`, aditiva: colunas novas e nulas em `classroom_atividades`.

| Coluna | Uso |
|---|---|
| `resolucao_local` | `concluida` (feita, mesmo sem entrega no Classroom) ou `dispensada` (não precisava entregar). Nulo é sem decisão. |
| `resolvida_em` | Quando a decisão foi tomada |
| `revisar_desde` | O Classroom mudou algo relevante (prazo, entrega, nota, título) **depois** da decisão |

- **Estado oficial e pessoal separados:** o oficial (`entrega_estado` e `situacaoClassroom`) só vem da APIClassroom. O pessoal (`resolucao_local` e o andamento `status_pessoal`) só o usuário altera, com permissão por coluna e RLS do dono. A sincronização nunca escreve essas colunas.
- **Regra única:** `situacaoEfetiva` (motor) é usada por painel, agenda, Hoje, Planejar a semana, lembretes, `.ics` e API/MCP.
  - **Entregue no Classroom** prevalece: é fato oficial.
  - Fora isso, `concluida` vira **Concluída no AgendaJeff**, e `dispensada` vira **Dispensada**.
  - Sem decisão, vale o oficial, recalculado na hora com os dados atuais.
- **Agenda e lembretes:** só entram as situações abertas (`SITUACOES_ABERTAS`: pendente, atrasada, não confirmada). Concluída aqui e dispensada saem de tudo, como a entregue.
- **Mudança no Classroom depois da decisão:** a decisão fica, e `revisar_desde` é preenchido. Mudanças só de anexos ou descrição não pedem revisão. O painel mostra o aviso "mudou no Classroom" e o filtro de revisão. "Já revisei a alteração" limpa só o aviso.
- **Reabrir:** apaga só `resolucao_local`, `resolvida_em` e `revisar_desde`. Nada de avaliação vinculada, anotações ou andamento é alterado.
- **Nada vai ao Classroom:** a APIClassroom continua só lida (GET). O e2e confere que nenhuma chamada além de GET foi feita durante as ações.

## 6. Prazos

- **`precisao = instante`:** guarda o `em_utc` em `prazo_em` (timestamptz) e mostra no horário de São Paulo, com uma única conversão (`prazoLocal`).
- **`precisao = somente_data_utc`:** guarda só a data em `prazo_data` e mostra "(sem horário)". **Nenhum horário inventado.**
- **`sem_prazo` e `incompleto`:** sem data. Não viram vencimento nem lembrete.
- **`situacao_temporal` da API:** não é usada como estado de entrega.
- **Prazo alterado pelo professor:** atualiza o **mesmo** registro, guarda o anterior em `prazo_anterior` e o cartão mostra "Prazo alterado" por 7 dias. Os lembretes passam a seguir o novo prazo, porque são calculados na hora.
- **Lembretes:** os mesmos das atividades cadastradas à mão: 3 e 1 dia antes, mais o dia. Entregue ou devolvida não gera lembrete.
- **Vínculo com avaliação manual:** se a atividade estiver vinculada a uma avaliação cadastrada à mão, a agenda mostra **só** a entrada do Classroom, sem duplicar nem gerar lembrete dobrado. A avaliação continua na Faculdade com os seus dados.

## 7. Sincronização

`lib/classroom/sincronizar.ts`, igual para a manual e a automática:

1. **Trava por usuário:** uma atualização condicional em `classroom_conexoes.sync_iniciada_em`. Uma segunda chamada simultânea recebe "em andamento". Uma trava com mais de 5 minutos é considerada morta.
2. **Turmas:** busca todas as páginas e faz upsert, preservando as escolhas do usuário. A turma que some da lista fica com `estado = null` e não é consultada.
3. **Ordem:** as turmas acompanhadas vão das que sincronizaram há mais tempo para as mais recentes. Se o tempo acabar, a próxima rodada continua delas (checkpoint por `ultima_sync_ok_em`).
4. **Por turma** (2 em paralelo, orçamento de 45 s):
   - busca todas as páginas de atividades e de entregas;
   - junta por `(course_id, activity_id)`;
   - compara com o snapshot guardado (`compararSnapshot`).
5. **Gravação:**
   - só o que é novo ou mudou, por upsert em lotes com o mesmo conjunto de colunas;
   - as colunas pessoais nunca entram no upsert;
   - as que não mudaram só têm o `visto_em` atualizado.
6. **Ausentes:** uma atividade guardada que não veio numa leitura **completa** da turma ganha `ausente_desde` (sai da agenda e do quadro). **Nada é apagado.** Se a turma falhar, nada é marcado.
7. **Resultado:**
   - `ok` quando todas as turmas foram sincronizadas;
   - `parcial` quando alguma falhou e o resto foi gravado;
   - `erro` quando nada foi lido.
   - Em 401 ou 403 sem renovação possível, a conexão vai para "Reconexão necessária".
   - O resumo (novas, atualizadas, entregas confirmadas, devolvidas, prazos alterados, ausentes, erros por turma) é **calculado pelo servidor** e mostrado na tela.

**Automática:**

- O pg_cron do Supabase chama `POST /api/classroom/cron` aos 17 minutos de cada 3 horas, com o cabeçalho `x-cron-secret`.
- A rota sincroniza só as conexões ativas com `auto_sync` ligado.
- Não depende do ChatGPT nem do navegador aberto.
- **Custo:** só o que já existe (pg_cron, pg_net, Vault e funções da Vercel).

## 8. Interface

**Faculdade → Atividades Classroom** (`/faculdade?aba=classroom`):

- **Estado da conexão:** conectado, desconectado, reconexão necessária, falha ou incompleta, com a última sincronização completa e o interruptor da sincronização automática.
- **Ações:** botão **Sincronizar agora** (sem disparo duplo) e **Turmas**.
- **Turmas:** escolher quais acompanhar, ligar cada uma a uma disciplina do AgendaJeff e dar um nome de exibição. Os aliases aparecem como "Também chamada de…".
- **Entregas da semana** (topo do painel, `entregasDaSemana` em `lib/classroom/painel.ts`): atrasadas e o que vence nos próximos 7 dias (hoje incluído), pelo estado efetivo, ordenadas por urgência (atrasadas, hoje, amanhã, próximos dias). Junta as atividades das turmas acompanhadas com os trabalhos e atividades cadastrados na Faculdade, sem provas e sem as avaliações vinculadas a uma atividade do Classroom. Sem prazo, entregues, devolvidas, concluídas aqui e dispensadas ficam de fora. Uma não confirmada com prazo passado aparece com "prazo passou; entrega não confirmada", sem afirmar atraso.
- **Indicadores:** pendentes, atrasadas, devolvidas, entregues e próximos 7 dias, só das turmas acompanhadas.
- **Filtros rápidos (com contagem):** para entregar, vencidas, próximos 7 dias, devolvidas, não confirmadas, entregues no Classroom, concluídas aqui, dispensadas e todas. Há também um aviso de revisão quando uma atividade resolvida mudou no Classroom.
- **Menu de cada cartão (e o detalhe):** Concluir no AgendaJeff, Não preciso entregar, Reabrir atividade e Já revisei a alteração. A confirmação aparece discreta, com **Desfazer**.
- **Outros filtros:** disciplina, busca pelo título, com ou sem prazo, e período.
- **Quadro:** agrupado por situação; as resolvidas (entregues no Classroom, concluídas aqui e dispensadas) ficam recolhidas em "Todas". Os selos usam ícone e texto diferentes para cada uma.
- **Cartão:** título, disciplina, selo do estado, prazo, urgência (até 3 dias), nota, "alterada recentemente", anexos e link para o Classroom.
- **Detalhe:**
  - campos oficiais e descrição completa, pedida só ao abrir;
  - anexos com o link de origem;
  - planejamento pessoal: andamento, começar em, prioridade, anotações e vínculo com avaliação;
  - "Criar tarefa para trabalhar nisso".
- **Estados vazios distintos:** sem configuração no servidor, não conectado, reconexão necessária, sem turmas escolhidas, sem atividades e nada para entregar.

## 9. Variáveis de ambiente (Vercel, Production)

| Variável | Valor |
|---|---|
| `CLASSROOM_AUTH0_DOMAIN` | `seu-tenant.us.auth0.com` (o Domain do tenant) |
| `CLASSROOM_AUTH0_CLIENT_ID` | Client ID do aplicativo AgendaJeff no Auth0 |
| `CLASSROOM_AUTH0_CLIENT_SECRET` | Client Secret desse aplicativo |
| `CLASSROOM_TOKEN_KEY` | 32 bytes em base64. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Trocar a chave invalida os tokens guardados, e aí basta conectar de novo. |
| `CRON_SECRET` | O **mesmo** valor do segredo `segredo_cron` do Vault (o mesmo do cron dos lembretes) |
| `CLASSROOM_EMAILS_PERMITIDOS` | Opcional: e-mails do AgendaJeff que podem usar a integração, separados por vírgula |
| `CLASSROOM_REDIRECT_URI` | Opcional: força a URL de retorno. O padrão é `<origem>/api/classroom/callback`. |

Em produção, a URL da APIClassroom é fixa no código. `CLASSROOM_API_URL` só vale fora de produção, para o simulador.

**Agendamento (Vault do Supabase na nuvem, uma vez):**

```sql
select vault.create_secret('https://agenda.example.com/api/classroom/cron', 'url_classroom_sync');
```

## 10. Rodar e testar localmente

- **Simulador:** o `.env.local` aponta para `tests/e2e/classroom-simulador.ts`, que imita o Auth0 (authorize, token, JWKS, revoke) e a APIClassroom com os mesmos contratos e verificações. Os dados são fictícios e há páginas de 2 itens para exercitar a paginação.
- **Unitários:** `npx vitest run tests/api/classroom.test.ts` cobre prazos, todos os estados, nota 0 ou nula, junção, deduplicação (inclusive na turma compartilhada), comparação de snapshot, agenda, indicadores e filtros.
- **De ponta a ponta:** `npx playwright test classroom` cobre:
  - OAuth com PKCE, tokens cifrados, escolha de turmas, paginação e idempotência;
  - quadro, detalhe sob demanda e preservação dos campos pessoais;
  - mudança de prazo e de entrega;
  - agenda, Hoje e API;
  - decisões locais: concluir, dispensar, desfazer, reabrir, sincronização e mudança oficial preservando a decisão, outro aparelho e "só GET" no Classroom;
  - turma com 503, sincronização simultânea, refresh negado e reconexão;
  - segurança (rotas sem sessão, cron sem segredo, tokens ilegíveis, colunas oficiais protegidas).
- **Validação com dados próprios:** use uma conta e turmas de teste criadas para a sua instalação; confira estado, prazo e deduplicação após repetir a sincronização. Não há IDs de turmas ou atividades pessoais distribuídos como exemplos nesta cópia.

### Testes com uma conexão real no banco local

Se o banco local tiver a sua conexão real e o `.env.development.local` estiver com a configuração real, rode os testes num servidor separado, apontado para o simulador:

```bash
NEXT_DIST_DIR=.next-teste CLASSROOM_AUTH0_DOMAIN=127.0.0.1:3997 CLASSROOM_AUTH0_CLIENT_ID=cliente-teste \
  CLASSROOM_AUTH0_CLIENT_SECRET=segredo-teste CLASSROOM_API_URL=http://127.0.0.1:3997 CLASSROOM_REDIRECT_URI= npx next dev -p 3001
E2E_URL=http://localhost:3001 npx playwright test classroom
```

Variáveis do processo têm prioridade sobre os arquivos `.env`. O teste do cron passa a conta de teste (`{"usuario": ...}`, aceito só fora de produção), para nunca sincronizar contas reais com o simulador. Com `E2E_URL`, o teste offline roda contra o servidor de desenvolvimento e falha por natureza: ele é feito para `npm run test:e2e:prod`.

## 11. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Integração ainda não configurada" | Faltam as variáveis da seção 9, ou `CLASSROOM_TOKEN_KEY` não tem 32 bytes |
| Volta com "Essa conta do Auth0 não tem acesso" | Login com outra conta ou conexão no Auth0 (`sub` diferente do `MCP_OWNER_SUB`) |
| "O Auth0 recusou a autorização" | Callback URL não cadastrada, grant Authorization Code desligado ou segredo errado |
| Pede reconexão depois de cerca de 1 hora | Sem refresh token: ligar "Allow Offline Access" na API do Auth0 |
| "Sincronização incompleta" | Uma turma falhou (Google ou APIClassroom). Os dados anteriores dessa turma ficam; tentar de novo. |
| Turma antiga aparece | Ela continua ACTIVE no Classroom: desmarque em **Turmas** |

## 12. Limitações e próximos passos

- Não há delta oficial: cada rodada relê as turmas acompanhadas inteiras (algumas dezenas de chamadas).
- O limite de 60 requisições por minuto da APIClassroom é por instância e em memória, então não é uma garantia global.
- Sem leitura de PDFs nem materiais ou avisos nesta versão (só metadados e links dos anexos).
- Não há notificação específica de "prazo mudou": o cartão sinaliza e os lembretes seguem o novo prazo.
- A APIClassroom só aceita o dono. Outra pessoa no AgendaJeff não conseguiria conectar a própria conta sem mudanças lá.
