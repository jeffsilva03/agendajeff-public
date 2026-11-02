# Auditoria da versão pública — Agenda Jeff

A cópia pública foi exportada somente com arquivos versionados revisados, sem copiar `.git`, histórico antigo, ambientes locais, tokens ou dados pessoais. Foi inicializado um repositório independente com um único commit raiz; não é um fork.

O repositório e a hospedagem de produção continuam separados. Esta revisão não acessou bancos pessoais nem alterou deploys, domínios ou credenciais de produção.

## Conteúdo público

- Seed de desenvolvimento e testes com dados fictícios em `tests/fixtures/dados-exemplo.json`.
- Sem seed pessoal, prompt de contexto privado, protótipo de rotina, captura pessoal de widget ou arquivos `.env` reais.
- IDs e rótulos de turmas/atividades nos exemplos e fixtures foram substituídos por valores fictícios. Guias de infraestrutura usam origens ilustrativas.
- Código, migrations, testes e documentação técnica preservados. `package-lock.json` continua versionado; dependências instaladas e builds locais não foram exportados.

## Limites de segurança

O código mantém a autenticação e RLS existentes. A revisão de exportação não é um pentest e não confirma as políticas em uma hospedagem real. O banco, OAuth, Classroom e as notificações exigem configuração própria.

As dependências mantêm os alertas da revisão anterior: 29 alertas no npm audit, incluindo 1 crítico e 6 altos, e o Next.js 16.4.0 bloqueou a aprovação do build. Essa pendência foi preservada e documentada; a criação da cópia pública não atualizou pacotes nem implantou a aplicação.
