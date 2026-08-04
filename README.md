# Hash Financeiro

Gestor financeiro pessoal: você importa o extrato do banco (CSV ou OFX), o
sistema categoriza cada lançamento automaticamente e um dashboard mostra para
onde o dinheiro foi.

Projeto de portfólio focado em três eixos: **processamento de dados**,
**domínio fintech** e **segurança/LGPD**.

## Funcionalidades

- **Importação resiliente** — detecção de separador (`;`, `,`, tab), mapeamento
  de colunas por sinônimo (`data|date|dt`, `descricao|historico|memo`,
  `valor|amount`), datas em pt-BR/ISO/OFX, valores `1.234,56` e `-1234.56`,
  campos com aspas. Linhas ruins viram relatório, não exceção.
- **Deduplicação** — hash SHA-256 de
  `usuario | conta | data | valor | tipo | descrição normalizada`, com
  `UNIQUE(usuario_id, hash_dedupe)` no banco como garantia final. Reimportar o
  mesmo extrato não duplica nada.
- **Categorização determinística** — motor de regras de palavra-chave com
  prioridade; regras do usuário vencem as do sistema; primeiro match vence.
  Trocar por IA no futuro significa substituir uma função pura, não a
  arquitetura.
- **Dashboard** — entradas, saídas, saldo, gastos por categoria (pizza +
  ranking) e série diária, filtrados por mês.
- **Correção manual** — trocar a categoria de qualquer transação; criar regra
  nova reclassifica o histórico não categorizado na hora.
- **Privacidade** — página com as garantias e botão de exclusão total (direito
  ao esquecimento).

## Stack

O plano original previa Express + Prisma + Next.js. O ambiente de execução é
**TanStack Start (React 19 + Vite)** com **Postgres gerenciado (Lovable
Cloud/Supabase)**, mantendo equivalência conceitual:

| Plano original      | Implementação                                            |
| ------------------- | -------------------------------------------------------- |
| Express controllers | `createServerFn` em `src/lib/hash-financeiro.functions.ts`     |
| Prisma schema       | `prisma/schema.prisma` (documentação) + migrations SQL    |
| Middleware de auth  | `requireSupabaseAuth` + RLS por `usuario_id` no banco     |
| Next.js App Router  | Rotas de arquivo em `src/routes`                          |

## Estrutura

```
src/lib/import/       parsers puros: csv.parser, ofx.parser, normalize, dedupe
src/lib/categorize/   engine.ts — motor de regras (função pura)
src/lib/types/        contratos de domínio compartilhados
src/lib/hash-financeiro.functions.ts   camada de serviço (server functions)
src/routes/           / (landing), /auth, /_authenticated/*
src/lib/__tests__/    testes unitários dos serviços puros
```

Os parsers e o motor de categorização não conhecem banco nem sessão — por isso
são testáveis sem infraestrutura.

## Modelo de dados

`perfis`, `contas`, `categorias`, `regras_categorizacao`, `transacoes`.
Valores monetários são `numeric` (nunca float), sempre positivos: o sinal vive
em `tipo` (`DEBITO` / `CREDITO`). Seed com 10 categorias padrão e 37 regras.

## Segurança e LGPD

Aplicado desde a Fase 1, não no fim (detalhes em [SECURITY.md](./SECURITY.md)):

1. **Isolamento no banco**, não só no código: Row Level Security por
   `usuario_id` em todas as tabelas de dado financeiro.
2. **Nada sensível em log**: nem descrição, nem valor, nem nome de arquivo —
   apenas contadores e IDs.
3. **Arquivo em memória**: o extrato é parseado e descartado; só as transações
   normalizadas são persistidas.
4. **Validação de entrada** com Zod em toda server function, além de limite de
   3 MB por upload e 5.000 lançamentos por importação.
5. **Autenticação obrigatória** (e-mail/senha ou Google) em toda rota de dado
   financeiro; a landing pública não toca em dado do usuário.
6. **Segredos** apenas em variáveis de ambiente do servidor.
7. **Direito ao esquecimento** em `/privacidade`: apaga dados e conta.

## Testes

```bash
npm test   # vitest: normalização, parsing CSV/OFX, dedupe e categorização
```

17 testes cobrem os casos difíceis: data impossível (`31/02`), milhar vs.
decimal, aspas com separador dentro, OFX SGML, estabilidade do hash e
precedência entre regra do usuário e regra do sistema.

## Roadmap concluído

| Fase | Entrega                                              |
| ---- | ---------------------------------------------------- |
| 0    | Arquitetura, modelo de dados, contratos              |
| 1    | Banco, migrations, RLS, seed                         |
| 2    | Autenticação e isolamento por usuário                |
| 3    | Importação e parsing de CSV                          |
| 4    | Motor de categorização + correção manual             |
| 5    | Dashboard e frontend                                 |
| 6    | OFX, LGPD, testes e documentação                     |
