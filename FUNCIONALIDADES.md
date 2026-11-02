# Cadeia: funcionalidades

App pessoal (PWA) de hábitos, agenda, faculdade, freelas e candidaturas, com cadeias de hábitos, organização acadêmica e acompanhamento de projetos. Funciona no iPhone (instalado na tela de início) e no PC, com os dados sincronizados entre os dois.

Versão pública de portfólio: sem hospedagem vinculada. Configure um ambiente próprio para executar.

---

## Conceitos

- **Hábito:** algo que você quer fazer todo dia. Cada um tem uma **versão mínima** (fácil o bastante para um dia ruim) e pode ter uma **versão completa**. O mínimo conta como feito.
- **Cadeia:** sequência de hábitos encadeados ("depois de X, eu vou Y"), com gatilho, dias da semana, período e uma **janela de horário** (ex.: Manhã 7h–12h). Uma cadeia pode depender de aula: em dia sem aula, os hábitos dela viram flexíveis.
- **Flexíveis:** hábitos sem horário fixo, que aparecem no dia e contam na adesão.
- **Registro (check):** cada hábito recebe um status por dia: **Feito**, **Mínimo**, **Não feito** ou **Não se aplica**.
- **Sequência:** dias seguidos com feito ou mínimo. A referência é **66 dias**, a mediana de formação de um hábito (de 18 a 254).

---

## Hoje

A tela principal, organizada em torno do que fazer agora.

- **Ver outros dias:** setas ‹ › ao lado da data passam para o dia anterior ou o próximo. No PC, as setas ← → do teclado fazem o mesmo. Tocar na data abre um calendário para pular direto para um dia (até um ano para cada lado), e o botão **Hoje** volta. Um aviso mostra a distância ("Amanhã", "Há 3 dias").
  - **Dias passados:** dá para corrigir os registros dos hábitos e as tarefas.
  - **Dias futuros:** os hábitos aparecem só para ver (marcar, só no próprio dia). As tarefas daquele dia podem ser criadas e editadas, para planejar.

- **Cartão do agora:** mostra em destaque o próximo passo da cadeia da vez, com gatilho, versão mínima e botões grandes de **Feito** e **Mínimo**. O menu "⋯" tem Não feito, Não se aplica, Iniciar foco, Anotar e Voltar para pendente. Ao marcar, o próximo passo assume o cartão.
- **Rótulo do momento:**
  - **Agora:** a cadeia está dentro da janela.
  - **A seguir:** a janela ainda não começou.
  - **Ficou pendente:** a janela passou e sobrou algo.

  O rótulo acompanha o relógio com o app aberto.
- **Depois, nesta cadeia:** os passos seguintes da cadeia atual, em linhas compactas. O círculo marca feito, o meio círculo marca mínimo.
- **Outras cadeias recolhidas:** cada bloco mostra horário, progresso (ex.: 0/2) e os nomes do que falta. Abre com um toque. Blocos cuja janela já terminou vão para o fim da lista.
- **Aviso de colisão:** quando um compromisso cai dentro da janela de uma cadeia, o bloco mostra um alerta (ex.: "Colide com reunião às 13h").
- **Registrados hoje:** bloco recolhido com o que já foi marcado e o resumo (ex.: "5 feitos, 1 mínimo, 1 pulado"). Tocar no ícone desfaz.
- **Dia fechado:** quando todos os hábitos estão registrados, aparece o resumo do dia.
- **Barra de progresso:** "X de Y hábitos" e "X de Y tarefas" no topo.
- **Sem aula:** dias de feriado ou de exceção mostram o motivo (ex.: "Sem aula, feriado de N. Sra. Aparecida") e a rotina se ajusta sozinha: os trajetos saem e os hábitos deles viram flexíveis.
- **Tarefas avulsas:** campo rápido "Adicionar tarefa e Enter…" ou o botão **+ Tarefa** para a versão completa (horário, notas, importante, repetição). As tarefas ficam numa seção separada dos hábitos.
- **Agenda e prazos:** aulas, compromissos e prazos do dia, além dos prazos dos próximos 45 dias.
- **Layout:** no PC, tarefas e agenda ficam numa coluna à direita, sempre abertas. No celular, viram blocos recolhíveis no fim da página.
- **Fim de semana:** atalho para **Planejar a semana**.
- **Recursos de apoio:**
  - **Desfazer:** todo registro mostra um aviso com "Desfazer".
  - **Sequências:** o número de dias seguidos aparece ao lado do hábito.
  - **Comemorações:** aos 7, 21, 30 e 66 dias seguidos, ao completar uma cadeia e ao fechar o dia.
  - **Notas:** uma linha sobre como foi, que aparece no histórico do hábito.
  - **Foco da semana:** selo destacado no hábito escolhido no planejamento.
  - **Abertura por notificação:** os blocos do período da notificação abrem e ficam destacados.
  - **Ícone com contador:** no app instalado, mostra quantos itens do período atual estão pendentes.

### Tarefas

- Prioridade **importante**, horário e notas.
- **Atrasadas:** tarefa não concluída passa para o dia seguinte com a marca "desde DD/MM".
- **Passar para amanhã**, **editar** e **excluir**.
- **Recorrentes:** todo dia, semanal (dias escolhidos) ou mensal (dia do mês), a partir de uma data. Aparecem sozinhas nos dias da regra e **não acumulam**: se não concluir, no dia seguinte vale a nova. É possível parar de repetir; o que já foi concluído fica no histórico.

---

## Hábitos

### Aba Progresso

- **Resumo:** adesão nos últimos 7 dias, dias com registro e maior sequência atual.
- **Cada hábito:** progresso rumo aos 66 dias e sequência. Tocar num hábito abre os detalhes.
- **Detalhe do hábito:**
  - **Mapa de calor** com o histórico desde o início do acompanhamento.
  - **Legenda:** feito, mínimo, não feito, não se aplica, não valia.
  - Notas dos registros.
  - Edição do nome e opção de arquivar o hábito.
- **Sem números inventados:** antes do primeiro dia completo, as métricas mostram que ainda não há dados.

### Aba Cadeias

- Cadeias agrupadas por tipo de dia: dia com aula, dia útil sem aula e fim de semana.
- **Criar e editar cadeia:** nome, gatilho, dias da semana, se depende de aula, janela de horário (início e fim, opcional) e se **aparece nos lembretes** (pode ficar desligada para uma atividade pessoal).
- **Passos:**
  - Adicionar, editar e remover.
  - Para cada passo: gatilho ("depois de…"), versão mínima, versão completa e "não antes de" (ex.: só a partir de 7h30).
- **Reordenar passos por arraste:** também funciona pelo teclado.
- **Mover um hábito para outro bloco (cadeia):**
  - pelo menu ⋯ do passo → "Mover para";
  - ou no "Editar passo", campo "Cadeia".

  O hábito vai para o fim da outra cadeia com o mesmo gatilho e mínimo, e o histórico continua.
- **Ordem das cadeias:** setas ↑ ↓ no topo de cada cadeia. A ordem define a sequência no Hoje.
- **Criar hábito:** escolhe a cadeia (ou "fora de cadeia", que fica guardado e não aparece no Hoje). Dicas no formulário ajudam a ancorar o hábito num momento que já acontece.
- **Seção Flexíveis** e seção **Fora de cadeia**. Cada hábito fora de cadeia tem um "Colocar em…" para entrar num bloco.
- **No detalhe de cada hábito (aba Progresso), "Onde aparece":**
  - em quais cadeias ele está, com "Mover para…" e "Tirar";
  - "Colocar também em…" outra cadeia;
  - se é flexível em dia útil sem aula ou no fim de semana.

---

## Agenda

- **Visões:** semana e mês.
- **Cada dia mostra:** aulas, compromissos, prazos, cadeias e flexíveis do dia.
- **Tipos de evento:**
  - **Compromisso:** reunião, consulta, encontro. Tem início e fim opcionais e local, e entra na verificação de colisão com as cadeias.
  - **Sem aula:** tira os trajetos; os hábitos deles viram flexíveis.
  - **Prazo:** entrega com data. Pode se repetir todo mês num dia fixo e ter lembretes em dias escolhidos ou N dias antes. Os lembretes saem na notificação das 8h e no próprio dia.
- **Feriados nacionais (2026 e 2027):** viram "Sem aula" automaticamente em dia útil. Dá para desfazer por dia ("Vou ter aula neste dia") e reativar depois.
- **Prazos de outras telas:** os de freelas, provas e trabalhos aparecem na Agenda e são editados nas telas de origem.

---

## Faculdade

- **Dia sem aula (qualquer motivo):** marque um dia ou um período (até 60 dias; só entram os dias com aula na grade) e escreva o motivo, ou toque numa sugestão: professor faltou, feriado ou ponte, evento da faculdade, aula cancelada, greve, recesso. A aula some do dia e a rotina vira a de dia sem aula (os trajetos saem e os hábitos deles viram flexíveis). Dá para desfazer na Faculdade ou no Hoje.
- **Faltas:** registre em quais aulas do dia você faltou, com o motivo (opcional). A opção **Não fui para a faculdade** (marcada por padrão) também deixa o dia como sem aula; desmarque se você foi e só perdeu parte da aula. Cada disciplina mostra quantas faltas tem, e a lista de faltas permite apagar uma registrada por engano.
- **Atividades Classroom** (aba da Faculdade): as atividades publicadas pelos professores no Google Classroom, lidas pela APIClassroom (só leitura).
  - **Conexão:** login uma vez pelo Auth0 da APIClassroom; o acesso se renova sozinho e pode ser desconectado. A sincronização também roda sozinha a cada 3 horas (dá para desligar).
  - **Turmas:** você escolhe quais acompanhar (o Classroom mantém turmas antigas como ativas), liga cada uma a uma disciplina do AgendaJeff e dá um nome curto. A turma de Automação, Projeto Integrador e Extensão é uma só: cada atividade aparece uma vez.
  - **Estados oficiais** (da sua entrega no Classroom): pendente, atrasada, devolvida (com a nota), entregue e status não confirmado. Publicada não quer dizer pendente.
  - **Prazos:** horário de São Paulo; prazo só com data fica sem horário; sem prazo não vira vencimento. Prazo alterado pelo professor atualiza o mesmo registro e o cartão avisa.
  - **Na agenda:** o que ainda pode precisar de entrega entra sozinho na Agenda, no Hoje, no Planejar a semana, nos lembretes (3 e 1 dia antes), no calendário assinado e no ChatGPT. Entregue ou devolvida sai.
  - **Entregas da semana** (no topo do painel): o que está atrasado e o que vence nos próximos 7 dias, em ordem de urgência (atrasadas, vence hoje, vence amanhã, próximos dias), com contagem regressiva e cores mais fortes para o que é para agora. Junta as atividades do Classroom com os trabalhos e atividades cadastrados na Faculdade (provas não entram; vinculadas aparecem uma vez). Concluídas aqui, dispensadas e entregues saem.
  - **Painel:** indicadores, filtros rápidos (para entregar, vencidas, próximos 7 dias, devolvidas, entregues), disciplina, busca, prazo e período; detalhe com a descrição completa, anexos e link para o Classroom.
  - **Seu planejamento** (a sincronização não mexe): andamento, data para começar, prioridade, anotações, vínculo com uma avaliação cadastrada (a agenda mostra uma entrada só) e "Criar tarefa para trabalhar nisso".
  - **Resolver só aqui:** em cada atividade, **Concluir no AgendaJeff** (já fez, mesmo sem entrega confirmada) ou **Não preciso entregar**. Ela sai das pendências, da agenda, dos lembretes e do ChatGPT, mas fica nos filtros "Concluídas aqui" e "Dispensadas". **Reabrir** volta ao estado do Classroom. Tem **Desfazer** na confirmação. Nada é enviado ao Classroom, e "Entregue no Classroom", "Concluída no AgendaJeff" e "Dispensada" aparecem com selos diferentes.
  - **Se o professor mudar uma atividade resolvida:** a sua decisão fica, mas o painel avisa para você revisar.
  - **Falhas:** uma turma fora do ar ou a falta de autorização nunca apagam o que já foi sincronizado; o painel avisa quando a sincronização foi incompleta.
- **Atalho no Hoje:** num dia com aula, o botão **Aula** abre **Não vai ter aula…** e **Faltei…** (o "Faltei" não aparece em dias futuros). Num dia que virou sem aula por uma marcação, aparece **Voltar a ter aula**.

- **Semestres:** nome, início e fim. As aulas só aparecem dentro do período do semestre.
- **Disciplinas:** nome, professor(a), sala e cor, com um ou mais horários semanais (dia, início e fim).
- **Grade semanal:** visão das aulas da semana.
- **Aulas no Hoje e na Agenda:** aparecem com horário, disciplina e sala.
- **Provas, trabalhos e atividades:**
  - Cadastro com disciplina, data, horário e detalhes.
  - Viram prazos na Agenda, com lembretes. Provas e trabalhos avisam 3 dias antes, na véspera e no dia. Atividades avisam na véspera e no dia. Todos saem às 8h.
  - Marcar como entregue e voltar para pendentes.
  - **Nota** e **média** por disciplina.

---

## Planejar a semana

Feita para o fim de semana. Mostra a semana seguinte.

- **Revisão:** os últimos 7 dias, com uma sugestão para a próxima semana.
- **O que vem aí:** aulas, provas, prazos e compromissos da semana.
- **Tarefas por dia:** distribuir o que precisa ser feito. As recorrentes aparecem sozinhas.
- **Foco da semana:** escolher um hábito para dar atenção extra. Ele aparece destacado no Hoje durante a semana.
- **Salvamento automático:** tudo é salvo conforme você mexe.

---

## Mês

Tela com três abas e as setas ‹ › para trocar de mês. Fica no menu (PC e celular) e na paleta Ctrl+K.

### Metas do mês

- **Três tipos:**
  - **Número:** você soma à mão com + e −, por exemplo 4 livros ou 12 treinos.
  - **Hábito:** conta sozinho os dias do mês com o hábito feito ou no mínimo.
  - **Marco:** feito ou não, por exemplo entregar o projeto.
- **Detalhes de cada meta:** área da vida (opcional) e "como vou medir".
- **Situação:** **Concluída**, **No caminho** ou **Atrás do ritmo**. A comparação é com o ritmo esperado para o dia do mês, mostrado como um tracinho na barra. Quando o mês termina, a meta aparece como **Mês encerrado**.
- **Resumo no topo:** metas, concluídas, no caminho e atrás do ritmo.
- **No Hoje:** o bloco "Metas do mês" mostra o progresso de cada uma.

### Raio-X da vida

Duas notas de 1 a 10 por área: **o quanto importa** e **o quanto você age nela hoje**. A diferença (gap) mostra se seus valores estão alinhados com suas prioridades e para onde sua energia está indo.

1. **Avaliação:** as 10 áreas sugeridas, com réguas de importância e ação. Dá para criar e remover áreas e começar pelas notas do mês anterior.
2. **Valores e plano:** as 3 áreas com maior gap e a que recebe energia demais. Para cada uma: o valor que está por trás e "eu me comprometo a".
3. **Foco do mês:** até 3 áreas, cada uma com a meta de ação (ex.: 2 → 5) e como medir. Mais: o que sai da agenda para caber isso e o dia do check-in. Um botão leva o foco para as **metas do mês**.
4. **Diagnóstico:**
   - **Onde está o gap:** importância, ação hoje e meta por área, do maior gap para o menor.
   - **Mapa de prioridades:** importância × ação, em quatro quadrantes: prioridade, em dia, pode esperar e energia demais.
   - **Plano de ação para o mês**, e a comparação com o gap médio do mês anterior.
- Tudo é salvo sozinho.

### Revisão mensal

- **Números do mês:**
  - adesão aos hábitos, com o mesmo cálculo da tela Hábitos;
  - tarefas concluídas, horas de freela, candidaturas enviadas e tempo de foco;
  - hábitos do mês, situação das metas, resumo do Raio-X e provas do mês com notas.
- **Reflexão:** nota do mês, o que funcionou, o que não funcionou, o que aprendi e foco do próximo mês. É salva sozinha.
- **Lembretes:** nos 2 últimos dias do mês, o Hoje lembra da revisão. Nos 3 primeiros, lembra da revisão do mês anterior e do Raio-X do novo. Na noite do último dia, o lembrete das 23h também avisa.

---

## Freelas

- **Quadro por status:** Proposta, Em andamento, Entregue, Pago. Os cancelados ficam ocultos e podem ser exibidos.
- **Cadastro:** projeto, cliente, descrição, prazo, valor (R$), horas estimadas e repositório.
- **Registro de horas:** manual ou pelo **cronômetro** (ao parar, as horas são registradas no freela).
- **Resumo:** horas no mês, horas gastas contra estimadas e valor a receber (entregues).
- **Prazo na Agenda:** com lembrete na véspera e no dia.
- **Sugestão de portfólio:** ao marcar como entregue, o app sugere registrar no portfólio, com um rascunho de texto para adaptar.

---

## Projetos

Ideias de projetos para desenvolver, da ideia solta até o lançamento.

- **Ideia rápida:** um campo no topo para anotar só o nome. A ideia entra com status **Ideia** e você detalha depois.
- **Status:** Ideia, Planejando, Em desenvolvimento, Pausado, Concluído e Arquivado. O app mostra há quanto tempo o projeto está no status atual.
- **Lista:** filtros Ativos (planejando, em desenvolvimento e pausados), Ideias, Concluídos, Arquivados e Todos, mais busca por nome ou tecnologia. Os **fixados** vêm primeiro, depois os em desenvolvimento e os de prioridade alta.
- **Cartão:** status, tipo, prioridade alta, progresso das features (geral e do MVP), próximo passo, tecnologias e prazo (em amarelo quando faltam 7 dias ou menos, em vermelho quando atrasado).
- **Página do projeto** (tudo salva sozinho ao sair do campo):
  - nome e a ideia em uma frase;
  - status, prioridade (alta, média, baixa), tipo (pessoal, portfólio, faculdade, negócio, estudo) e fixar no topo;
  - descrição, problema que resolve e para quem;
  - **features** com status (a fazer, fazendo, feito: um toque no círculo avança) e prioridade: **Essencial** (entra no MVP), Importante ou Extra. Cada uma tem detalhes, fica na ordem de trabalho e as feitas vão para uma lista recolhida;
  - **próximo passo**, com o botão **Colocar no Hoje**, que vira tarefa do dia (o mesmo vale para qualquer feature);
  - tecnologias, links do repositório e do site/demo, datas de início e prazo e anotações livres.
- **Excluir:** apaga o projeto e as features. Para só tirar da frente, use o status Arquivado.

---

## Candidaturas

- **Quadro por status:** enviada, em processo, entrevista, oferta, recusada, desisti. Dá para mudar o status pelo diálogo de edição.
- **Cadastro:** empresa, vaga, origem (LinkedIn, Gupy, indicação…), link da vaga, data de envio, notas e **próxima etapa** com data e horário.
- **Próxima etapa:** entra na Agenda e nos lembretes.
- **Integração com o hábito:** registrar uma candidatura marca o hábito "Enviar candidaturas" como **mínimo** naquele dia.
- **Resumo:** últimos 7 dias, quantas tiveram resposta e quantas chegaram a entrevista ou oferta.

---

## Insights

Cada análise só aparece quando há dias suficientes de registro. Antes disso, fica bloqueada mostrando quantos dias faltam; nada é estimado.

- **Últimos 7 dias:** aos domingos, vira **Revisão da semana**, com uma sugestão para a semana seguinte.
- **Adesão por hábito:** feito ou mínimo, nos dias em que o hábito valia.
- **Onde a cadeia quebra:** em que passo cada cadeia mais para.
- **Adesão por período do dia:** manhã, tarde, noite e sem horário.
- **Adesão por dia da semana.**
- **Hábitos que andam juntos:** quando fazer um aumenta a chance de fazer outro no mesmo dia (diferença de 20 pontos ou mais).
- **Tempo de foco:** sessões concluídas pelo cronômetro, por semana.

---

## Cronômetro e foco

- **Iniciar foco** pelo menu de um hábito no Hoje: a duração vem do mínimo (ex.: 25 min).
- **Cronômetro de freela:** iniciado pela tela de Freelas.
- **Cronômetro flutuante:** continua visível mesmo ao trocar de tela.
- **Ao concluir:**
  - O foco de hábito oferece marcar o hábito.
  - O de freela registra as horas, com uma descrição do que foi feito.
- Dá para descartar o tempo sem registrar.

---

## Notificações (push)

- **Disparos:** lembretes nos horários configurados (padrão **8h, 13h e 23h**), todos os dias, só com o que está pendente no período. Se não houver nada pendente, nada é enviado.
- **Conteúdo de cada horário:**
  - **8h:** prazos e lembretes de prazo do dia.
  - **13h e 23h:** também os itens sem período (flexíveis e fim de semana).
  - Cadeias com lembretes desativados não aparecem nas notificações.
- **Funcionamento:** um agendamento no servidor roda a cada 5 minutos e não envia o mesmo lembrete duas vezes.
- **Onde funciona:** iPhone (com o app instalado na tela de início) e PC (Chrome ou Edge).
- **Abertura:** a notificação abre o Hoje já no período certo.
- **Lembretes ao longo do dia (opcional, desligado por padrão):**
  - **Frequência:** a cada 1 h, 1h30, 2 h, 3 h ou 4 h, dentro de uma janela (padrão: 8h às 22h).
  - **Conteúdo:** só uma **frase motivacional**, com saudação pelo horário (Bom dia, Boa tarde, Boa noite). O andamento de tarefas e hábitos continua só nos lembretes dos horários fixos.
  - **Frases:** banco com mais de 100 frases separadas por manhã, tarde e noite, mais as **suas próprias frases** (opcionais).
  - **Quando não sai:** se um lembrete fixo foi enviado há menos de 45 minutos.

---

## Ajustes

- **Instalar o app:** passo a passo, incluindo o do iPhone.
- **Notificações neste aparelho:** ativar ou desativar e **enviar teste**.
- **Aparelhos:** lista dos que recebem lembretes, com opção de remover. Inscrições expiradas saem sozinhas.
- **Horários dos lembretes:** adicionar, remover, ativar e desativar.
- **Registro de envios:** cada disparo, com sucesso, erro ou motivo de não envio.
- **Agenda no calendário do celular:** link pessoal (.ics) para assinar no Calendário do iPhone, Google ou Outlook. Compromissos, dias sem aula e prazos se atualizam sozinhos. Dá para **gerar um novo link** e invalidar o antigo.
- **Backup:** baixa uma cópia completa dos dados em JSON.
- **Conta:** tema claro ou escuro, **trocar senha** e sair. Ao sair, o app apaga do aparelho os dados guardados e a fila offline.
- **Lembretes ao longo do dia:** ligar, intervalo, janela de horário, suas frases e a prévia de como ficaria agora.
- **Widget na tela inicial:**
  - **iPhone:** pelo app gratuito **Scriptable** (o iOS não deixa apps web terem widget). O app gera um script com um token só de leitura, que pode ser revogado.
  - **PC:** pelo painel de Widgets do Windows 11, com o app instalado pelo Edge.
  - **O que mostra:** hábitos do dia, próximo hábito, tarefas, agenda, metas do mês, sequência e uma frase. Há uma prévia do que o widget mostra.
- **Integrações externas:** interruptor que permite a aplicativos autorizados (como o ChatGPT) **consultar** a agenda, só para leitura. Começa desligado. Mostra o que pode e o que nunca é compartilhado, os aplicativos conectados com o último uso, o botão de **revogar** e o endereço para conectar.

---

## Integrações externas (API e MCP)

> Publicado em 12/10/2026. Falta validar a conexão no próprio ChatGPT; o estado de cada etapa está em `docs/INTEGRACAO_CHATGPT.md`.

- **API REST privada e somente leitura** em `/api/integrations/agenda/v1/`: hoje, agenda por período, tarefas, faculdade, hábitos, candidaturas, freelas, projetos (lista e detalhe), mês (metas, Raio-X e revisão mensal), semana, insights, busca e verificação de disponibilidade. As respostas usam as mesmas regras das telas. Detalhes em `docs/API_INTEGRACAO.md` e `docs/openapi.yaml`.
- **Servidor MCP** em `/mcp`, com 14 ferramentas de consulta para assistentes de IA.
- **Tudo liberado para leitura (desde 20/10/2026):** o aplicativo autorizado vê toda a agenda, inclusive as anotações, os projetos completos, o Raio-X e a revisão mensal.
- **Login delegado (OAuth 2.1)** pelo próprio Supabase: o assistente nunca recebe a senha. Você entra no AgendaJeff e toca em **Permitir** numa tela de consentimento.
- **Proteções:**
  - O aplicativo externo não consegue gravar nada, nem pelo banco.
  - Não vê as tabelas internas (senha, link do calendário, aparelhos de notificação e backups).
  - Para de funcionar na hora se o interruptor for desligado ou o acesso for revogado.
  - Há um limite de 60 consultas por minuto.

---

## Recursos gerais

- **PWA instalável:** ícone na tela de início e abertura em tela cheia.
- **Funciona sem internet:**
  - As telas já abertas ficam disponíveis offline.
  - Registros e tarefas feitos sem sinal ficam guardados no aparelho e são enviados sozinhos quando a conexão volta, com o aviso "X registros aguardando envio".
- **Sincronização em tempo real** entre celular e PC.
- **Paleta de comandos (Ctrl+K):** navegar, criar e marcar hábitos de hoje pelo teclado.
- **Tema escuro** (padrão) e **claro**, com contraste acessível.
- **Animações:** respeitam a opção do sistema de reduzir movimento.
- **Navegação:** barra lateral no PC e barra inferior no celular.

---

## Segurança e privacidade

- Login com e-mail e senha. O cadastro de novas contas está fechado.
- Cada pessoa só enxerga os próprios dados: há regras de acesso por usuário em todas as tabelas do banco.
- O link do calendário usa um token secreto que pode ser trocado a qualquer momento.
- Segredos (chaves de acesso) ficam fora do código e do repositório.
- Aplicativos externos só leem, só com autorização explícita e com as integrações ligadas; o acesso pode ser revogado a qualquer momento.

---

## Onde roda

- **App:** Next.js hospedado na Vercel (https://agenda.example.com).
- **Banco, login, tempo real e funções de lembrete:** Supabase.
- **Desenvolvimento local:** Supabase via Docker e `npm run dev`. Os detalhes técnicos e os comandos estão no `README.md`.
