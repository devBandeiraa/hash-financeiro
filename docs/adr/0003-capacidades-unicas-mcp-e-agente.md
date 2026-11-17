# 0003 — Uma implementação de capacidades para MCP e agente

- Status: aceita
- Desde: 2026-08-07 (`5c90edf`)

## Contexto

O projeto expunha as mesmas operações por dois caminhos: as ferramentas do
servidor MCP (autenticadas por OAuth) e as server functions do app
(autenticadas por sessão). As duas implementações já tinham divergido:
`resumo_dashboard` e `resumoDashboard` calculavam o fim do mês de formas
diferentes.

## Decisão

`src/lib/capacidades` é a implementação única. Cada capacidade recebe um
client Supabase já autenticado como o usuário e o `userId`, sem saber por qual
protocolo foi chamada. O servidor MCP (`mcp/adaptador.ts`) e o agente interno
(`agente/ferramentas.ts`) são adaptadores finos por cima.

O agente não dá a volta pelo OAuth do próprio servidor: MCP e sessão convergem
no mesmo objeto, e é o RLS do banco que isola nos dois caminhos.

## Consequências

- Uma correção numa capacidade vale para clientes MCP externos e para o agente.
- Cada capacidade declara se é leitura ou escrita, e é isso que permite o
  agente exigir confirmação só para escrita
  ([0002](./0002-ia-propoe-usuario-confirma.md)). Por isso `gerenciar_regras`
  foi dividida em `listar_regras` e `criar_regra`; o nome antigo continua no
  MCP para não quebrar clientes externos.
- O `userId` nunca entra em schema de ferramenta, e há teste travando isso.
