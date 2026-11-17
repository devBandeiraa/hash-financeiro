# Changelog

Todas as mudanças relevantes do Hash Financeiro, agrupadas por fase de desenvolvimento.
Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e mensagens no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/).

## [0.2.0] - 2026-11-17

### Mudança incompatível

- Importação de OFX substituída por PDF de extrato. O texto do PDF é extraído
  no navegador (pdfjs) e só o resultado vai ao servidor; o parser reconhece
  data, descrição e valor por heurística. PDF digitalizado (imagem) não é lido,
  e a interface sugere CSV. O enum `origem_import` passa a usar `PDF`;
  lançamentos legados marcados como `OFX` viram `CSV`.

### Fases A1–A5 — IA na categorização e nos insights

- Camada de modelo server-side com provedor plugável (`ClienteModelo`): Gemini
  por padrão, Anthropic como alternativa paga. Timeout por tentativa, retry só
  em falha transitória e parse de JSON tolerante.
- Fallback de categorização: só o que o motor de regras não pegou vai para a
  IA, que propõe; nada é gravado sem confirmação. Sugestão aceita vira regra
  determinística (`origem = 'ia'`, prioridade 200, que perde para a regra manual,
  de prioridade 10).
  Sem palavra-chave confiável, a categoria é aplicada sem criar regra.
- Procedência da categoria: `transacoes.categoria_origem` e
  `regras_categorizacao.origem` (`sistema` | `usuario` | `ia`), com badge na
  interface.
- Insights mensais a partir de totais agregados, guardados em
  `insights_mensais` e invalidados pela impressão digital (SHA-256) dos
  agregados.
- Minimização de dado: à IA vão só a descrição (categorização) e só os totais
  agregados (insights).
- Sem chave de IA ou com o provedor fora do ar, o sistema segue funcionando
  sem os recursos de IA.

### Fases B1–B3 — Agente conversacional

- Capacidades únicas em `src/lib/capacidades`, consumidas pelo servidor MCP e
  pelo agente interno. Eram duas implementações, e já tinham divergido no
  cálculo do fim do mês. `gerenciar_regras` foi dividida em `listar_regras` e
  `criar_regra`; o nome antigo continua exposto no MCP.
- Tela `/assistente` com loop de tool use e resposta em streaming (NDJSON).
- Escrita proposta pelo modelo vira proposta com botão de confirmar; só o
  clique do usuário executa (`confirmarAcaoAgente`).
- Guardrails: até 6 iterações e 90s por mensagem, argumentos validados por Zod,
  `userId` sempre da sessão.
- Esforço baixo e teto de tokens no loop de conversa.

### Dados e interface

- Exclusão em lote das transações importadas (CSV/PDF), mantendo os
  lançamentos manuais, e exclusão de conta, com confirmação.
- `excluirMinhaConta` passa a apagar também `insights_mensais`.
- Botões da landing abrem o cadastro; `/auth` aceita `?modo=criar|entrar`.
- Landing destaca o assistente de IA.
- Novo favicon vetorial, com `.ico` em vários tamanhos.
- Projeto renomeado de FinPessoal para Hash Financeiro.

### Corrigido

- O servidor MCP lia `VITE_SUPABASE_PROJECT_REF`, variável que não existe;
  passa a ler `VITE_SUPABASE_PROJECT_ID`, sem valor embutido no código.
- As políticas de RLS de `transacoes` e `regras_categorizacao` conferiam só
  `usuario_id`. Uma linha podia apontar para a conta ou a categoria de outro
  usuário cujo UUID se conhecesse, e o `ON DELETE CASCADE` da conta do outro
  apagava a transação. Agora a conta tem de ser do usuário e a categoria, do
  usuário ou do sistema (migration `20261117120000`). Linhas gravadas antes
  não são verificadas; a migration traz a consulta para conferir.

### Qualidade, segurança e documentação

- CI no GitHub Actions: tipos, lint, testes e build a cada push.
- Teste de integração do RLS contra o Supabase local (80 casos), em job
  próprio no CI (`npm run test:integracao`).
- Eval da categorização com 203 descrições sintéticas (`npm run eval`); o modo
  só regras roda no CI com piso de 27%.
- 112 testes unitários (eram 17), incluindo a camada de IA com o modelo mockado.
- Lint zerado; `.gitattributes` força LF.
- Migrations aplicadas por `npm run db:migrate` (CLI do Supabase).
- Modelo padrão da Anthropic passa a `claude-haiku-5-5`.
- Server functions divididas por domínio em `src/lib/servico`, com as mesmas
  exportações.
- `prisma/schema.prisma` removido; o schema vive nas migrations.
- README declara a stack real e a origem do scaffold; decisões de arquitetura
  registradas em `docs/adr`; licença MIT.

## [0.1.0] - 2026

### Fase 0 — Arquitetura e modelagem

- Definição da arquitetura em camadas (`src/lib/import`, `categorize`, `dashboard`, `auth`).
- Modelagem de domínio em `prisma/schema.prisma` (Usuario, Conta, Categoria, Transacao, RegraCategorizacao).
- Tipos de domínio em `src/lib/types/dominio.ts`.
- Checklist de segurança e LGPD em `SECURITY.md`.

### Fase 1 — Banco de dados

- Migração inicial: enums (`tipo_conta`, `tipo_transacao`, `origem_import`) e tabelas.
- Row Level Security habilitada em todas as tabelas, com isolamento por usuário.
- Trigger `handle_new_user` para criação automática de perfil.
- Seed com 10 categorias padrão e 37 regras de categorização.

### Fase 2 — Autenticação

- Login por e-mail/senha e Google OAuth.
- Rotas protegidas via layout `_authenticated` e guard de sessão.

### Fase 3 — Processamento de extratos

- Parser de CSV com detecção de dialeto e mapeamento de colunas.
- Suporte a OFX de bancos brasileiros.
- Normalização de descrições e deduplicação por hash SHA-256.

### Fase 4 — Motor de categorização

- Categorização determinística por regras de palavra-chave com prioridade.
- CRUD de regras pelo usuário.

### Fase 5 — Interface e dashboard

- Dashboard com indicadores mensais e gráficos (Recharts).
- Telas de importação, transações e regras.
- Server functions com RLS aplicada por usuário.

### Fase 6 — Qualidade, segurança e LGPD

- 17 testes unitários com Vitest.
- Direito ao esquecimento: exclusão definitiva da conta e dos dados.
- Página `/privacidade` e documentação completa no `README.md`.

### Prévia de importação (dry-run)

- Análise do arquivo antes de gravar: linhas lidas, a importar, duplicadas e inválidas.
- Amostra das transações com situação (NOVA/DUPLICADA) e impacto financeiro estimado.

### Identidade visual

- Design system com tokens OKLCH, tipografia e componentes de painel.
- Landing page com fundo animado WebGL (shader "Silk").
- Modo escuro por padrão, com interruptor de tema e persistência.
- Ajustes de contraste para legibilidade sobre o fundo animado.

### Integrações de agentes (MCP)

- Servidor MCP com OAuth e tela de consentimento.
- Seis ferramentas: contas/categorias, resumo do dashboard, listagem e criação de
  transações, categorização e gerenciamento de regras.
