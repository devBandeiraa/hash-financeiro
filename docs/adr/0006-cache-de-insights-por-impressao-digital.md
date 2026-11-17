# 0006 — Cache de insights invalidado por impressão digital

- Status: aceita
- Desde: 2026-08-07 (`78ed58e`)

## Contexto

O insight mensal é um texto gerado por IA a partir dos agregados do mês.
Gerá-lo a cada carregamento da tela gastaria cota. Um cache com tempo de
expiração poderia mostrar uma análise que não corresponde mais aos números,
por exemplo depois de importar um extrato novo.

## Decisão

O texto fica guardado em `insights_mensais`, um por usuário e mês, junto com a
`impressao`: o SHA-256 dos agregados que o produziram (`impressaoAgregado`).
A cada pedido, os agregados são recalculados; se a impressão bate com a
guardada, o texto do cache é devolvido, e se diverge o texto é gerado de novo.
`forcar` ignora o cache.

## Consequências

- Nunca se mostra uma análise que não corresponde aos dados atuais, e não há
  tempo de expiração arbitrário.
- Os agregados em si não são guardados, só o hash. O texto já contém os
  números que importam.
- Com a IA fora do ar, a tela mostra o último texto gerado, marcado como tal.
