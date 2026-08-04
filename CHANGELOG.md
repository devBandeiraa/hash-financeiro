# Changelog

Todas as mudanças relevantes do Hash Financeiro, agrupadas por fase de desenvolvimento.
Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e mensagens no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/).

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
- Suporte a PDF de extrato: texto extraído no navegador e lançamentos reconhecidos por heurística.
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
