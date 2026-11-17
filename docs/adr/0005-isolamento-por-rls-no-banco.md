# 0005 — Isolamento por usuário no banco, com RLS

- Status: aceita
- Desde: 2026-07-31 (`5b6ea4f`)

## Contexto

Cada usuário só pode ver e alterar os próprios dados financeiros. O primeiro
item do checklist de segurança (`SECURITY.md`) pede esse isolamento no banco,
não só no código. O mesmo dado é lido por três caminhos: server functions,
servidor MCP e agente.

## Decisão

O isolamento é aplicado pelo Postgres, com Row Level Security por `usuario_id`
em todas as tabelas de dado financeiro: `perfis`, `contas`, `categorias`,
`regras_categorizacao`, `transacoes` e `insights_mensais`. Categorias e regras
do sistema (`usuario_id` nulo) são legíveis por todos e não podem ser
alteradas pelos usuários.

O código acessa o banco como o usuário logado: `requireSupabaseAuth` monta um
client Supabase com a sessão dele, e as políticas valem para tudo que passa por
ali. A service role, que ignora RLS, é usada num único ponto: a remoção da
conta de acesso em `excluirMinhaConta`.

## Consequências

- Uma consulta que esqueça o filtro por usuário não vaza dado de outro usuário.
- O mesmo isolamento vale para server functions, MCP e agente
  ([0003](./0003-capacidades-unicas-mcp-e-agente.md)).
- Colunas novas nascem cobertas, porque as políticas são por linha.
- `tests/integracao/rls.integracao.ts` verifica as políticas contra um Postgres
  real.
- Limite conhecido: as políticas conferem só `usuario_id`. Uma linha pode
  referenciar `conta_id` ou `categoria_id` de outro usuário cujo UUID se
  conheça (ver CHANGELOG, seção "Conhecido" da 0.2.0).
