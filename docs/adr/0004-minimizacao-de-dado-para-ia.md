# 0004 — Só descrição ou agregado sai para a IA

- Status: aceita
- Desde: 2026-08-07 (`0bf73c1`, `f19845f`)

## Contexto

O provedor padrão é o Gemini, pelo tier gratuito, e no tier gratuito o Google
pode usar os prompts para treinar modelo. O app guarda dados financeiros
pessoais.

## Decisão

Sai do sistema só o mínimo para cada recurso:

| Recurso       | Vai para o modelo                              | Nunca vai                              |
| ------------- | ---------------------------------------------- | -------------------------------------- |
| Categorização | só a descrição do lançamento                   | valor, data, saldo, conta, titular, id |
| Insights      | só totais agregados por categoria e a variação | qualquer transação individual          |

A fronteira fica em duas funções: `montarPrompt` (categorização) e
`montarPromptInsight` (insights) recebem apenas o que pode sair.

## Consequências

- Vazar outro dado exigiria mudar a assinatura dessas funções, e há teste
  fixando o que o prompt carrega.
- A chave da API é lida só em módulos `.server.ts`, carregados por
  `await import()` dentro de server functions; o bundle do navegador não tem o
  SDK nem o nome da variável.
- Erros de provedor são registrados por classe e status HTTP, sem conteúdo
  enviado ou recebido.
- A alternativa paga (`IA_PROVEDOR=anthropic`) não treina em input de API, mas
  a minimização vale para os dois provedores.
