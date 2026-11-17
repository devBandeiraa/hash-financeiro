# 0002 — A IA propõe, o usuário confirma

- Status: aceita
- Desde: 2026-08-07 (`f19845f` na categorização, `fe82098` no agente)

## Contexto

Dois recursos usam um modelo de linguagem que pode levar a uma escrita no
banco: o fallback de categorização, que sugere categorias, e o agente
conversacional, que pode pedir para criar transação ou regra. No projeto, a
IA é auxiliar do motor determinístico, não substituta.

## Decisão

Nenhuma escrita disparada por IA grava sem confirmação do usuário.

- Categorização: `sugerirCategoriasPorIa` não grava nada. A tela mostra
  `descrição → categoria sugerida` e a palavra-chave que virará regra, e o
  usuário aceita tudo, parte ou nada. Só `aplicarSugestoesIa` escreve.
- Agente: capacidade de escrita não roda no loop. Ela vira uma proposta com
  botão de confirmar, e o modelo recebe um resultado marcado como `pendente`.
  Só o clique do usuário chama `confirmarAcaoAgente`.

Sugestão aceita vira `regra_categorizacao` com `origem = 'ia'`. Se a descrição
não tem âncora confiável, a categoria é aplicada mas nenhuma regra nasce.

## Consequências

- O sistema fica mais determinístico com o uso: o próximo extrato com o mesmo
  estabelecimento é pego pelo motor, sem chamar IA.
- A confirmação não apaga a procedência: escrita vinda do agente ou de cliente
  MCP continua marcada como `ia`, e correção pelo dropdown marca `usuario`.
- A frase de confirmação resolve UUIDs para nomes, para o usuário conseguir
  avaliar o que está aprovando.
- Regra ruim contaminaria todo import futuro em silêncio; por isso a extração
  de palavra-chave é conservadora.
