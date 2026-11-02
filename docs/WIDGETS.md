# Widgets

O mesmo resumo do dia alimenta os dois widgets: hábitos do dia, próximo hábito, tarefas, agenda, metas do mês, sequência e uma frase. Quem monta o resumo é `lib/widget.ts`, a partir do motor, então as contas são as mesmas do Hoje e das metas. O resumo sai pela rota `GET /api/widget`.

| Acesso | Quem usa | Como |
|---|---|---|
| `Authorization: Bearer wjt_…` | Scriptable (iPhone) | Token de 256 bits gerado no navegador em Ajustes → Widget. O banco guarda só o hash SHA-256 (`profiles.widget_token_hash`). Revogar apaga o hash. |
| Cookie de sessão | Service worker do PWA (Windows) | Mesma origem, sem token. |

A rota é só de leitura e devolve só o resumo do dia. `?formato=adaptive` devolve o formato plano usado pelo template do Windows.

## iPhone (Scriptable)

O iOS não permite widget de app web na tela inicial. Um widget nativo exigiria um app iOS (Xcode num Mac e a conta paga de desenvolvedor da Apple). O caminho gratuito é o app **Scriptable**:

1. Instalar o Scriptable.
2. Em Ajustes → Widget, tocar em **Gerar script** e copiar.
3. No Scriptable, criar um script, colar e dar o nome "Cadeia".
4. Na tela inicial, adicionar um widget do Scriptable (pequeno, médio ou grande) e, em **Editar widget**, escolher o script "Cadeia".

O script fica em `lib/widget-scriptable.ts`. O widget pede atualização a cada 30 minutos, mas quem decide a frequência real é o iOS.

**Verificado:**
- O script é JavaScript válido. O teste compila o script com `await` no nível de cima, como o Scriptable faz.
- A rota responde com o token e recusa token inválido ou revogado.

**Não verificado:** a renderização no Scriptable de um iPhone real.

## Windows 11 (painel de Widgets)

- **Definição:** no manifest (`app/manifest.ts`, membro `widgets`).
- **Template:** em Adaptive Cards, no arquivo `public/widgets/agenda.json`.
- **Atualização:** pelo service worker (`public/sw.js`):
  - quando o widget é instalado (`widgetinstall`) e quando o painel volta a exibi-lo (`widgetresume`);
  - pelo botão "Atualizar" (`widgetclick`);
  - a cada 30 minutos (`periodicsync`);
  - ao chegar uma notificação push e ao ativar uma versão nova do service worker.

Para aparecer:
1. Instalar o app pelo **Microsoft Edge**.
2. Instalar o **Windows App SDK** e ligar o **Modo de desenvolvedor**, como pede a documentação atual da Microsoft para widgets de PWA.
3. Abrir o painel com **Win + W** → **Adicionar widgets** → **Cadeia: hoje**.

Distribuir sem o modo de desenvolvedor exigiria empacotar o app na Microsoft Store (PWABuilder).

**Verificado:**
- O template e os dados existem.
- A rota responde com a sessão no formato do template.
- O service worker passa na checagem de sintaxe.

**Não verificado:** o widget no painel de um Windows real, que depende dos passos acima.
