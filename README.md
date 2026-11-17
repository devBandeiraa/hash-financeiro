# Hash Financeiro

[![CI](https://github.com/devBandeiraa/hash-financeiro/actions/workflows/ci.yml/badge.svg)](https://github.com/devBandeiraa/hash-financeiro/actions/workflows/ci.yml)

Gestor financeiro pessoal: você importa o extrato do banco (CSV ou PDF), o
sistema categoriza cada lançamento automaticamente e um dashboard mostra para
onde o dinheiro foi.

**Demo:** a publicar. Login por e-mail e senha.

<!-- TODO(jhordan): trocar "a publicar" pelo link da demo publicada (passo a passo em docs/deploy.md). -->

<!-- TODO(jhordan): gravar o GIF do fluxo importar → categorizar → dashboard → assistente, salvar em docs/demo.gif e trocar este comentário por: ![Fluxo: importar extrato, categorizar, dashboard e assistente](docs/demo.gif) -->

Projeto de portfólio focado em três eixos: **processamento de dados**,
**domínio fintech** e **segurança/LGPD**.

## Funcionalidades

- **Importação resiliente** — detecção de separador (`;`, `,`, tab), mapeamento
  de colunas por sinônimo (`data|date|dt`, `descricao|historico|memo`,
  `valor|amount`), datas em pt-BR/ISO, valores `1.234,56` e `-1234.56`,
  campos com aspas. Linhas ruins viram relatório, não exceção.
- **Deduplicação** — hash SHA-256 de
  `usuario | conta | data | valor | tipo | descrição normalizada`, com
  `UNIQUE(usuario_id, hash_dedupe)` no banco como garantia final. Reimportar o
  mesmo extrato não duplica nada.
- **Categorização determinística** — motor de regras de palavra-chave com
  prioridade; regras do usuário vencem as do sistema; primeiro match vence.
  Reproduzível e auditável: mesma entrada, mesma saída, sempre.
- **Fallback por IA com dry-run** — o que o motor não pegou vai para um modelo
  de linguagem, que **propõe**; você confirma. Aceitar vira regra
  determinística ([detalhes](#inteligência-artificial)).
- **Insights mensais** — resumo em português das variações do mês, gerado a
  partir de totais agregados e exibido junto com os números que o embasam.
- **Agente conversacional** — pergunte "quanto gastei com transporte esse mês?"
  e ele consulta de verdade, com as mesmas ferramentas do servidor MCP. Escrita
  só com confirmação ([detalhes](#agente-conversacional)).
- **Dashboard** — entradas, saídas, saldo, gastos por categoria (pizza +
  ranking) e série diária, filtrados por mês.
- **Correção manual** — trocar a categoria de qualquer transação; criar regra
  nova reclassifica o histórico não categorizado na hora.
- **Limpeza de dados** — apagar em lote só o que veio de importação (CSV/PDF),
  mantendo lançamentos manuais e regras; ou excluir uma conta inteira, o que
  leva as transações dela junto (`ON DELETE CASCADE`). As duas ações pedem
  confirmação explícita antes de rodar.
- **Privacidade** — página com as garantias e botão de exclusão total (direito
  ao esquecimento).

## Como rodar

Pré-requisitos: Node.js 22 e um projeto Supabase (o plano gratuito serve).

```bash
npm install
cp .env.example .env   # preencha com as chaves do seu projeto Supabase
```

Antes do primeiro acesso, aplique as migrations de `supabase/migrations` no
banco do projeto. A CLI do Supabase vem como dependência de desenvolvimento:

```bash
cp supabase/config.toml.example supabase/config.toml   # troque SEU_PROJECT_REF pelo ref do projeto
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF        # pede a senha do banco
npm run db:migrate                                     # aplica, em ordem, só o que ainda não foi aplicado
```

Depois:

```bash
npm run dev            # o endereço local aparece no terminal
```

<!-- TODO(jhordan): rodar `npm run db:migrate` contra um projeto Supabase real e confirmar o fluxo acima. Num banco em que as migrations já foram coladas à mão pelo SQL Editor, a CLI não tem o histórico e tentaria reaplicá-las: marque-as como aplicadas uma vez com `npx supabase migration repair --linked --status applied <versão>` para cada arquivo. -->

Para publicar (Cloudflare Workers, plano gratuito), veja
[docs/deploy.md](./docs/deploy.md): passo a passo, variáveis de ambiente e o
que não funciona fora do Lovable (login com Google).

## Stack

| Camada       | O que é usado                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Aplicação    | TanStack Start (React 19 + Vite); rotas de arquivo em `src/routes`                                                |
| Servidor     | server functions (`createServerFn`) em `src/lib/servico/`, um arquivo por domínio                                 |
| Banco        | Postgres no Supabase, com RLS por `usuario_id` em toda tabela de dado financeiro                                  |
| Schema       | migrations SQL em `supabase/migrations`, aplicadas com `npm run db:migrate`                                       |
| Autenticação | Supabase Auth (e-mail/senha); Google via `@lovable.dev/cloud-auth-js`; `requireSupabaseAuth` nas server functions |
| Validação    | Zod                                                                                                               |
| Interface    | Tailwind CSS 4, componentes shadcn/ui (Radix), Recharts                                                           |
| IA           | Gemini (`@google/genai`) por padrão; Anthropic (`@anthropic-ai/sdk`) como alternativa                             |
| MCP          | `@lovable.dev/mcp-js`, com as ferramentas definidas em `src/lib/mcp`                                              |
| Testes       | Vitest                                                                                                            |

O projeto começou num scaffold do [Lovable](https://lovable.dev). Vieram dele a
configuração de build (`@lovable.dev/vite-tanstack-config`), a integração com o
Supabase e o login com Google (`src/integrations/`), o tratamento de erro do
servidor (`src/server.ts`, `src/start.ts`, `src/lib/error-*.ts`), os componentes
de `src/components/ui` (shadcn/ui) e as rotas HTTP do MCP geradas por
`@lovable.dev/mcp-js`. Foram escritos à mão os parsers de extrato
(`src/lib/import`), o motor de regras (`src/lib/categorize`), a camada de IA
(`src/lib/ai`, `src/lib/categorize/ai`, `src/lib/insights`), o servidor MCP
(`src/lib/mcp`, `src/lib/capacidades`) e o agente (`src/lib/agente`).

## Estrutura

```
src/lib/import/       parsers puros: csv.parser, pdf.parser, pdf.extract, normalize, dedupe
src/lib/categorize/   engine.ts — motor de regras (função pura)
src/lib/categorize/ai/  fallback por IA: sugerir, palavra-chave, aplicar
src/lib/ai/           modelo.server.ts (timeout/retry/parse) + provedores/
src/lib/insights/     agregar.ts — agregação mensal e prompt (funções puras)
src/lib/types/        contratos de domínio compartilhados
src/lib/servico/      camada de serviço (server functions), um arquivo por domínio:
                      contas, categorias, importacao, transacoes, dashboard,
                      privacidade, ia, agente; hash-financeiro.functions.ts reexporta
src/lib/capacidades/  implementação única, compartilhada por MCP e agente
src/lib/agente/       loop de tool use, prompt, leitura do streaming
src/lib/mcp/          servidor MCP com OAuth (adaptador sobre capacidades)
src/components/ia/    sugestões, insights, badge de origem, chat do agente
src/routes/           / (landing), /auth, /_authenticated/*
src/lib/__tests__/    testes unitários dos serviços puros
```

Os parsers e o motor de categorização não conhecem banco nem sessão — por isso
são testáveis sem infraestrutura. O mesmo vale para a camada de IA: montagem de
prompt, interpretação da resposta e agregação são funções puras; só o cliente
do provedor toca a rede.

## Inteligência artificial

A IA aqui é **auxiliar do motor determinístico, não substituta**. Quatro
decisões definem o desenho:

### 1. O determinístico roda primeiro, sempre

O motor de regras processa o extrato inteiro. Só o que sobra sem categoria vai
para a IA. O resultado das regras continua reproduzível — nada do que a IA faz
altera o caminho determinístico.

### 2. A IA propõe, o usuário confirma

Nenhuma escrita disparada por IA grava sem confirmação. A tela mostra
`descrição → categoria sugerida`, com a palavra-chave que virará regra, e você
aceita tudo, parte ou nada. É o mesmo dry-run que o import já usava.

### 3. Sugestão aceita vira regra determinística

Ao confirmar, além de gravar a categoria, o sistema cria uma
`regra_categorizacao` com `origem = 'ia'`. **No próximo extrato o motor pega
aquele estabelecimento sozinho, sem chamar IA.** O sistema fica _mais_
determinístico com o uso, não menos.

A extração da palavra-chave é deliberadamente conservadora: se a descrição não
tem âncora confiável (`TARIFA 001`, `PIX ENVIADO 99887766`), a categoria é
aplicada mas **nenhuma regra nasce**. Regra ruim contamina todo import futuro em
silêncio; sugestão sem regra só custa uma chamada a mais depois.

### 4. Toda categoria declara sua procedência

`transacoes.categoria_origem` e `regras_categorizacao.origem` guardam
`sistema` | `usuario` | `ia`. A interface marca com badge o que não veio do
motor. Auditoria não fica ambígua: dá para separar o que uma regra classificou
do que um modelo sugeriu.

### Minimização de dado

Esta é a parte que mais importa num app financeiro. O que sai do sistema:

| Recurso       | Vai para o modelo                                  | **Nunca** vai                          |
| ------------- | -------------------------------------------------- | -------------------------------------- |
| Categorização | só a **descrição** do lançamento                   | valor, data, saldo, conta, titular, id |
| Insights      | só **totais agregados** por categoria e a variação | qualquer transação individual          |

A fronteira é verificável em uma função: `montarPrompt` (categorização) e
`montarPromptInsight` (insights) recebem _apenas_ o que pode sair. Não há como
vazar o resto sem mudar a assinatura — e há teste fixando isso.

Além disso: a chave da API é lida só dentro de server functions, via
`await import()` de módulos `.server.ts`, e o build confirma que nem o SDK nem o
nome da variável aparecem no bundle do navegador. Nenhum dado financeiro vai
para log — erros de provedor são registrados por classe e status HTTP.

### Provedor

Abstraído atrás de `ClienteModelo`, uma interface de um método. Trocar de
provedor é um arquivo em `src/lib/ai/provedores/`.

O padrão é o **Gemini** (`gemini-3.1-flash-lite`), pelo tier gratuito. Duas
ressalvas registradas por honestidade:

- **No tier gratuito o Google pode usar os prompts para treinar modelo.** É
  exatamente por isso que a minimização acima não é opcional neste projeto.
- A alternativa (`IA_PROVEDOR=anthropic`) é paga, mas não treina em input de
  API. O padrão é `claude-haiku-5-5`, o mais barato da linha atual
  (US$ 0,10 / US$ 0,50 por milhão de tokens de entrada/saída).
  <!-- TODO(jhordan): medir o custo real de uma importação com claude-haiku-5-5 e publicar aqui. -->

### Degradação

Sem chave configurada, ou com o provedor fora do ar, **o sistema continua
funcionando por inteiro**: o motor de regras não depende de IA. A interface diz
"IA indisponível" e segue mostrando os números, que vêm do banco. Os insights
caem para o último texto gerado, marcado como tal.

O cache de insights é invalidado por **impressão digital dos agregados**, não
por TTL: se os números mudam, o texto é regerado. Nunca se mostra uma análise
que não corresponde mais aos dados.

## Agente conversacional

Em `/assistente`: você pergunta em português, o agente **consulta os dados com
ferramentas** e responde com o número real. Se pedir uma alteração, ela vira
uma proposta com botão de confirmar.

### O servidor MCP virou a fundação, não um anexo

O projeto já expunha um **servidor MCP com OAuth** — qualquer cliente MCP
externo (Claude Desktop, por exemplo) consulta estas finanças sob RLS. O agente
interno consome **exatamente as mesmas capacidades**.

Isso não era verdade de graça. Existiam duas implementações paralelas da mesma
coisa — as ferramentas do MCP e as server functions do app — e elas **já tinham
divergido**: `resumo_dashboard` e `resumoDashboard` calculavam o fim do mês de
formas diferentes. Hoje há uma implementação só:

```
src/lib/capacidades/     7 capacidades, sem saber por qual protocolo vieram
  ├── mcp/adaptador.ts        OAuth   → contexto   (clientes externos)
  └── agente/ferramentas.ts   sessão  → contexto   (agente interno)
```

O agente **não dá a volta pelo OAuth do próprio servidor**: MCP e sessão
convergem no mesmo objeto — um client Supabase autenticado como o usuário — e é
o RLS do banco que isola, nos dois caminhos.

### Como o loop funciona

Modelo pede ferramenta → executa → devolve o resultado → modelo responde,
encadeando quantas precisar. A resposta chega em **streaming** (NDJSON, um
evento por linha), então o texto aparece conforme é gerado.

O loop vive em `agente/conversa.ts` e não conhece provedor nem banco: recebe um
`ClienteModelo` e um executor. É isso que permite testar encadeamento, erro de
ferramenta e estouro de limite sem tocar a rede.

### Escrita nunca executa sozinha

Capacidade de escrita **não roda no loop**. Ela vira uma proposta que sobe para
a tela, e ao modelo devolvemos um resultado marcado como `pendente` — o que o
faz perguntar em vez de afirmar que fez. Só o clique do usuário chama
`confirmarAcaoAgente`.

A frase de confirmação resolve os UUIDs para nome (`descrições com "UBER" →
Transporte`), porque uma confirmação que ninguém consegue avaliar não é
confirmação.

Escrita vinda do agente ou de cliente MCP marca `origem = 'ia'`. A confirmação
legitima a ação, mas não apaga o fato de um modelo ter escolhido a categoria —
e é isso que a auditoria precisa saber. Correção pelo dropdown da interface
continua marcando `usuario`.

### Guardrails

|                     |                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------- |
| `userId`            | sempre da sessão; **nunca** entra em schema de ferramenta — há teste travando isso |
| Iterações           | máximo 6 idas e voltas por mensagem                                                |
| Timeout             | 90s por mensagem, e aborta se o cliente desconectar                                |
| Argumentos          | validados por zod **antes** de tocar o banco; erro volta ao modelo, que corrige    |
| Escopo              | pedido fora de finanças pessoais é recusado sem chamar ferramenta                  |
| Falha de ferramenta | volta como resultado, não como exceção — a conversa não cai                        |

### Três detalhes que só apareceram contra a API real

Ficam registrados porque custaram tempo e não aparecem com mock:

1. **O Gemini 3.x recusa (400) um `functionCall` reenviado sem a
   `thoughtSignature`** que ele mesmo emitiu — e o atalho `chunk.functionCalls`
   do SDK descarta essa assinatura. É preciso ler `candidates[0].content.parts`.
2. **Dizer ao modelo "peça confirmação" faz ele pedir em prosa, sem chamar a
   ferramenta** — e aí não existe proposta estruturada, nem botão na tela. O
   prompt precisa deixar claro que _chamar a ferramenta é_ o mecanismo de
   proposta.
3. **O loop de conversa não herdava o `esforco: "baixo"` da chamada de
   categorização** — cada turno (até 6 por mensagem) ficava no orçamento de
   raciocínio padrão do modelo, sem teto de saída. Corrigido em
   `agente/conversa.ts`. Um benchmark isolado contra a API real, porém, mostrou
   variância grande (2s a 30s+) nos dois cenários — no tier gratuito isso
   parece dominado por fila/rede do provedor, não só pelo orçamento de
   raciocínio. A mudança fica porque é de graça e remove uma variável do
   controle do time, não porque resolve sozinha toda lentidão percebida.

## Modelo de dados

`perfis`, `contas`, `categorias`, `regras_categorizacao`, `transacoes`,
`insights_mensais`.
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
6. **Segredos** apenas em variáveis de ambiente do servidor — incluindo a chave
   da API de IA, que nunca chega ao bundle do navegador.
7. **Direito ao esquecimento** em `/privacidade`: apaga dados e conta.
8. **Minimização no envio para IA**: só descrição (categorização) e só
   agregados (insights). Detalhes em [Inteligência artificial](#minimização-de-dado).
9. **Procedência auditável**: toda categoria declara se veio do motor, do
   usuário ou de IA.

## Testes

```bash
npm test   # vitest: funções puras — sem rede, sem banco, sem cota de IA

$env:IA_PING="1"; npm test   # + ping real contra o provedor (consome cota)
```

112 testes cobrem os casos difíceis: data impossível (`31/02`), milhar vs.
decimal, aspas com separador dentro, extrato PDF, estabilidade do hash,
precedência entre regra do usuário e regra do sistema, e — na camada de IA —
JSON quebrado, categoria alucinada fora da lista, retry só em falha
transitória, e a garantia de que o prompt não carrega nada além do permitido.

A aplicação das sugestões (o código que escreve categoria _e_ cria regra) tem
teste de integração com um duplo do Supabase, afirmando sobre os filtros que
sustentam a segurança: `is categoria_id null` para idempotência e a rejeição de
`categoriaId` que o usuário não enxerga.

### Isolamento por usuário contra o banco real

O RLS é testado contra um Postgres de verdade, no Supabase local (precisa de
Docker):

```bash
cp supabase/config.toml.example supabase/config.toml   # se ainda não existir
npm run supabase:local     # sobe Postgres, Auth e a API e aplica as migrations
npm run test:integracao
```

O teste cria dois usuários e, em cada uma das seis tabelas com dado financeiro,
confere que A não lê, não altera, não apaga e não cria linhas de B, nem passa
uma linha própria para B, e que consegue fazer isso com as próprias. Também
cobre as linhas do sistema em `categorias` e `regras_categorizacao` (todos
leem, ninguém altera) e o acesso sem sessão. São 73 casos, em
`tests/integracao/`, rodando num job próprio do CI.

### Eval da categorização

`evals/categorizacao.csv` tem 203 descrições sintéticas de extrato bancário
brasileiro, cada uma com a categoria esperada: 114 com nome claro e 89 difíceis
(36 abreviadas, 29 ambíguas, 24 sem âncora). O conjunto foi escrito sem
consultar as regras do seed, para não medir as regras contra si mesmas, e as
regras não foram ajustadas a ele. Nenhum dado é real.

| Modo                    | Acerto geral   | Cobertura      | Acerto quando propõe | Data       | Modelo                  |
| ----------------------- | -------------- | -------------- | -------------------- | ---------- | ----------------------- |
| Só motor de regras      | 27,1% (55/203) | 19,7% (40/203) | 87,5% (35/40)        | 17/11/2026 | nenhum (determinístico) |
| Regras + fallback de IA | —              | —              | —                    | —          | —                       |

<!-- TODO(jhordan): com GEMINI_API_KEY no .env, rodar `npm run eval` e preencher a linha "Regras + fallback de IA" com os números de evals/resultados/regras-ia.md (data e modelo saem no relatório). -->

Cobertura é a parte das descrições em que o sistema propôs alguma categoria;
o resto fica "Não categorizado". O motor de regras erra pouco quando decide,
mas decide em só um quinto do conjunto. Os 55 acertos gerais incluem as 20
descrições cujo rótulo esperado é "Não categorizado", que o motor acerta por
não decidir. Por caso, no modo só regras: claro 27,2%, sem âncora 70,8%,
ambíguo 13,8%, abreviação 8,3%. Os erros, linha a linha, estão em
`evals/resultados/`.

```bash
npm run supabase:local   # as regras e categorias vêm do banco migrado
npm run eval:regras      # só regras; roda no CI com piso de 27%
npm run eval             # os dois modos; o modo com IA consome cota e é pulado sem chave
```

## Decisões de arquitetura

As decisões descritas acima estão registradas, uma por arquivo, em
[`docs/adr`](./docs/adr): determinístico antes da IA, IA propõe e usuário
confirma, capacidades únicas para MCP e agente, minimização de dado, RLS no
banco e cache de insights por impressão digital. O histórico de versões está no
[CHANGELOG](./CHANGELOG.md).

## Roadmap concluído

| Fase  | Entrega                                              |
| ----- | ---------------------------------------------------- |
| 0     | Arquitetura, modelo de dados, contratos              |
| 1     | Banco, migrations, RLS, seed                         |
| 2     | Autenticação e isolamento por usuário                |
| 3     | Importação e parsing de CSV                          |
| 4     | Motor de categorização + correção manual             |
| 5     | Dashboard e frontend                                 |
| 6     | PDF, LGPD, testes e documentação                     |
| A1–A2 | Camada de IA: wrapper com retry, serviço de sugestão |
| A3    | Fallback com dry-run e promoção a regra              |
| A4    | Insights mensais com cache por impressão digital     |
| A5    | Interface, degradação e documentação                 |
