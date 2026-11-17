# Registros de decisão de arquitetura

Cada arquivo registra uma decisão que o projeto já tomou: o contexto, a decisão
e as consequências. As justificativas vêm do código, das migrations e do README
do projeto; nenhuma foi escrita depois para defender a escolha.

| #                                                         | Decisão                                            | Desde      |
| --------------------------------------------------------- | -------------------------------------------------- | ---------- |
| [0001](./0001-deterministico-antes-da-ia.md)              | O motor de regras roda antes da IA, sempre         | 2026-08-07 |
| [0002](./0002-ia-propoe-usuario-confirma.md)              | A IA propõe, o usuário confirma                    | 2026-08-07 |
| [0003](./0003-capacidades-unicas-mcp-e-agente.md)         | Uma implementação de capacidades para MCP e agente | 2026-08-07 |
| [0004](./0004-minimizacao-de-dado-para-ia.md)             | Só descrição ou agregado sai para a IA             | 2026-08-07 |
| [0005](./0005-isolamento-por-rls-no-banco.md)             | Isolamento por usuário no banco, com RLS           | 2026-07-31 |
| [0006](./0006-cache-de-insights-por-impressao-digital.md) | Cache de insights invalidado por impressão digital | 2026-08-07 |

"Desde" é a data do commit em que a decisão entrou no código. Os registros
foram escritos em 2026-11-17.
