# Integração com o ChatGPT (MCP + OAuth 2.1)

Este guia explica como o ChatGPT (ou outro cliente MCP) consulta o AgendaJeff, o que já foi validado e o que ainda falta. A API por trás está em [API_INTEGRACAO.md](API_INTEGRACAO.md).

## Estado desta versão pública

O código do servidor MCP e OAuth está incluído, mas esta cópia não tem hospedagem nem credenciais de produção vinculadas. Os domínios abaixo são exemplos para uma instalação própria. A publicação do MCP, o consentimento e o cliente devem ser configurados e validados nesse ambiente.

Os testes E2E e a integração real com um cliente externo não foram executados durante a exportação pública. Não use credenciais ou banco do projeto de produção para testar esta cópia.

## Como funciona

```
ChatGPT ──(1) POST /mcp sem token──────────────► 401 + WWW-Authenticate: resource_metadata=.../.well-known/oauth-protected-resource/mcp
        ──(2) GET metadados do recurso─────────► { resource: https://agenda.example.com/mcp,
                                                    authorization_servers: [https://<ref>.supabase.co/auth/v1] }
        ──(3) descoberta OAuth no Supabase ────► /.well-known/oauth-authorization-server/auth/v1  (S256, registration_endpoint)
        ──(4) registro dinâmico (DCR) ─────────► client_id
        ──(5) /oauth/authorize (PKCE) ─────────► login no AgendaJeff → tela /oauth/consent → "Permitir"
        ──(6) troca do código por token ───────► access token JWT (claim client_id) + refresh token
        ──(7) POST /mcp com Bearer ────────────► ferramentas consultam os serviços com RLS do usuário
```

O que acontece no AgendaJeff durante esse fluxo:

- **Interruptor:** **Ajustes → Integrações externas** precisa estar ligado. Começa desligado e só o usuário liga. Desligado, a tela de consentimento avisa e só permite recusar. Se for desligado depois, toda chamada recebe `integracao_desativada`.
- **Banco:** o token do cliente externo só lê. As políticas RESTRICTIVE do Postgres impedem qualquer gravação e a leitura das tabelas internas, mesmo fora do MCP.
- **Anotações:** incluídas nas consultas quando a integração é autorizada. As ferramentas entregam as anotações, os projetos completos e o Mês (metas, Raio-X e revisão mensal).
- **E-mail:** se o cliente pedir os escopos `email` ou `profile` no login (o ChatGPT pede por padrão quando o provedor anuncia), ele recebe o e-mail da conta. A tela de consentimento avisa quando isso acontece.

## Ferramentas MCP

Todas têm `readOnlyHint: true` e validação de parâmetros. Os erros voltam como `isError: true`, com `code` e `message`.

| Ferramenta | Para perguntas como | Parâmetros |
|---|---|---|
| `agenda_get_today` | "O que tenho para fazer hoje?", "Tenho aula hoje?" | `date?` |
| `agenda_get_week` | "Como está minha próxima semana?", "O que tenho pendente nesta semana?" | `date?` |
| `agenda_list_events` | "Quais meus compromissos amanhã?", "Tenho algo no sábado?" | `start`, `end` (até 62 dias) |
| `agenda_list_tasks` | "Quais tarefas estão atrasadas?" | `date?`, `start?`, `end?`, `status`, `overdue?`, `important?`, `recurring?`, `limit`, `offset` |
| `agenda_get_college_schedule` | "Qual minha grade de sexta?", "Quais disciplinas estou cursando?" | `date?`, `semester` |
| `agenda_list_college_deadlines` | "Tenho prova próxima?", "O que não entreguei?" | `status`, `type?`, `includeGrades` |
| `agenda_get_habit_progress` | "Qual hábito tem a maior sequência?", "O que deixei de cumprir ontem?" | `date?`, `start?`, `end?` (até 92 dias), `habitId?` |
| `agenda_list_applications` | "Tenho entrevista agendada?", "Quem ainda não respondeu?" | `status?`, `upcoming?`, `limit`, `offset` |
| `agenda_list_freelances` | "Quanto tenho a receber?", "Quantas horas trabalhei no mês?" | `status?`, `limit`, `offset` |
| `agenda_list_projects` | "Quais projetos estou desenvolvendo?", "Quanto falta para o MVP?" | `status?`, `limit`, `offset` |
| `agenda_get_project` | "Me ajuda a planejar as features do projeto X" | `projectId` |
| `agenda_get_month` | "Como estão minhas metas do mês?", "O que o Raio-X diz que preciso cuidar?" | `month?` (AAAA-MM) |
| `agenda_get_insights` | "Como está minha consistência?" | — |
| `agenda_search` | "Achar a tarefa do boleto" | `q`, `categories?`, `limit`, `offset` |

Cada ferramenta devolve só o recorte pedido. A grade, por exemplo, não traz as provas, e as provas não trazem a grade, a não ser quando se pede as médias.

## Passo a passo para conectar

### A. Publicar (precisa de autorização)

1. Aplicar a migration na nuvem: `npx supabase db push --linked`.
2. Supabase (painel do projeto) → **Authentication → OAuth Server**:
   - ligar o OAuth 2.1 Server;
   - Authorization Path: `/oauth/consent` (configure a Site URL da sua instalação);
   - ligar **Allow dynamic client registration**: o ChatGPT se registra sozinho. Qualquer cliente MCP consegue se registrar, mas nenhum acessa nada sem o seu login, o seu "Permitir" e o interruptor ligado.
3. Vercel → variável `MCP_RESOURCE_URL=https://agenda.example.com/mcp` (Production).
4. Merge de `api-integracoes` na `main`; a Vercel publica.
5. Conferir (sem dados pessoais):
   ```bash
   curl https://agenda.example.com/api/integrations/agenda/v1/health
   curl https://agenda.example.com/.well-known/oauth-protected-resource/mcp
   curl https://SEU-PROJETO.supabase.co/.well-known/oauth-authorization-server/auth/v1
   curl -i -X POST https://agenda.example.com/mcp   # deve dar 401 com WWW-Authenticate
   ```

### B. No AgendaJeff

Ajustes → **Integrações externas** → ligar o interruptor.

### C. No ChatGPT

1. Ative o modo desenvolvedor ou os conectores personalizados, se a sua conta oferecer. A disponibilidade depende do plano e das configurações da conta. As fontes consultadas divergem sobre quais planos têm acesso, então confira na sua conta.
2. Crie um conector, ou app, apontando para o servidor MCP `https://agenda.example.com/mcp`, com autenticação OAuth.
3. O ChatGPT abre o login do AgendaJeff: entre com sua conta e toque em **Permitir**.
4. Faça uma pergunta de teste ("o que tenho para fazer hoje?") e confira com a tela Hoje.

## Pontos de atenção (ainda não verificados com o ChatGPT)

Cada item abaixo está pronto no código, mas só a etapa 6 confirma.

- **Audiência do token:** o ChatGPT envia o parâmetro `resource` (RFC 8707). Não está documentado se o Supabase copia esse valor para a claim `aud`. A API aceita `aud` igual a `authenticated` (o padrão do Supabase) ou igual a `MCP_RESOURCE_URL`, então funciona nos dois casos.
- **Escopo `openid`:** exige chaves de assinatura assimétricas. O projeto na nuvem usa ES256, conforme o JWKS público.
- **`offline_access` (refresh token):** o Supabase anuncia esse escopo. Sem refresh, o acesso expira junto com o token, em cerca de 1 hora, e o ChatGPT pediria login de novo.
- **Endereço de retorno:** o ChatGPT registra o próprio `redirect_uri` no registro dinâmico (`https://chatgpt.com/connector_platform_oauth_redirect`, ou um por conector). Se o Supabase recusar, o caminho é registrar o cliente manualmente no painel com essa URI.
- **Registro sem DCR (CIMD):** o ChatGPT prefere um documento de metadados de cliente quando o provedor oferece. Não está claro se o Supabase oferece. Com DCR ligado, o ChatGPT usa o registro dinâmico.
- **Vercel:** cada chamada MCP é uma requisição curta e sem estado (Streamable HTTP, sem SSE longo e sem Redis), com `maxDuration` de 30 s.

## Revogar

| O que fazer | Como | Efeito |
|---|---|---|
| Revogar um aplicativo | Ajustes → Integrações externas → **Revogar** | Apaga as sessões e os refresh tokens dele. O token atual deixa de valer (testado localmente). |
| Pausar todos | Desligar o interruptor | Nenhuma consulta externa passa, com efeito imediato. |
| Remover o cliente | Supabase → Authentication → OAuth Apps | Apaga o cliente registrado. |
