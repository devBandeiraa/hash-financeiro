# 0001 — O motor de regras roda antes da IA, sempre

- Status: aceita
- Desde: 2026-08-07 (`f19845f`); o motor de regras existe desde `1fc087a`

## Contexto

A categorização tem dois caminhos possíveis: um motor de regras de
palavra-chave, determinístico, e um modelo de linguagem. O motor é
reproduzível e auditável (mesma entrada, mesma saída), mas não reconhece o que
nenhuma regra cobre.

## Decisão

O motor de regras processa o extrato inteiro primeiro (`categorize/engine.ts`,
função pura). Só o que fica sem categoria vai para a IA
(`sugerirCategoriasPorIa`). Nada do que a IA faz altera o caminho
determinístico.

## Consequências

- O resultado das regras continua reproduzível e testável sem rede.
- Sem chave de IA, ou com o provedor fora do ar, a categorização por regras
  funciona por inteiro; a interface diz "IA indisponível".
- A IA só é chamada para o que sobrou, o que limita custo e cota
  (`LIMITE_DESCRICOES_IA`).
- Ver também [0002](./0002-ia-propoe-usuario-confirma.md): sugestão aceita vira
  regra, então o caminho determinístico cresce com o uso.
