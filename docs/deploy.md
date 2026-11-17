# Publicar a demo

Recomendação: **Cloudflare Workers, plano gratuito.** As informações sobre a
Cloudflare e o Supabase foram conferidas na documentação oficial em
17/11/2026, e o build foi testado localmente com o `wrangler`.

## Por que Cloudflare Workers

- O build já sai pronto para lá. A configuração do Lovable
  (`@lovable.dev/vite-tanstack-config`) usa o preset `cloudflare-module` do
  Nitro, com `nodejs_compat`, e o `npm run build` gera
  `.output/server/wrangler.json`. Não é preciso mudar código nem configuração.
- A Cloudflare está entre os parceiros oficiais de hospedagem do
  [TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/hosting).
- [Plano Free](https://developers.cloudflare.com/workers/platform/limits/):
  100.000 requisições por dia e limite de 64 MiB por Worker, sem compressão
  (este tem 6,0 MiB). Requisições HTTP não têm limite de duração, então o
  streaming do assistente, de até 90 s, cabe.
- O código lê os segredos por `process.env`. Com `nodejs_compat` e
  `compatibility_date` a partir de 2025-04-01, segredos e variáveis do Worker
  aparecem em `process.env`
  ([documentação](https://developers.cloudflare.com/workers/configuration/environment-variables/)).

Teste local, com o Worker do build rodando no `wrangler dev` contra o Supabase
local:

- landing, `/auth`, `/dashboard` e `/privacidade` respondem 200;
- a API do assistente responde 401 sem token e 401 com token forjado;
- com o token de um usuário real, a requisição passa da autenticação. Isso
  confirma que o Worker leu `SUPABASE_URL` do `process.env`.

## Limitações conhecidas fora do Lovable

- **Login com Google não funciona.** O botão usa `@lovable.dev/cloud-auth-js`,
  que redireciona para `/~oauth/initiate`. Essa rota é servida pela hospedagem
  do Lovable, não pelo app. Login e cadastro por e-mail e senha funcionam.
- **CPU de 10 ms por requisição no plano Free.** Esperar rede (Supabase, IA)
  não conta. Renderizar a página no servidor conta. A Cloudflare tolera
  estouros eventuais; estouros constantes devolvem o erro 1102 ("Worker
  exceeded resource limits"). No teste local, cada página levou de 30 a 60 ms
  de tempo total. Esse número não é tempo de CPU e não prova nada sobre o
  limite: é preciso medir depois do deploy (passo 7).
- **Servidor MCP com OAuth:** depende de `@lovable.dev/mcp-js`. Não foi testado
  fora do Lovable.

## Pré-requisitos

- Conta gratuita na Cloudflare.
- Projeto Supabase com as migrations aplicadas (`npm run db:migrate`, ver
  "Como rodar" no README).
- `.env` preenchido a partir do `.env.example` e `supabase/config.toml` com o
  ref do projeto. O build lê os dois.
- Docker, se o build for feito no Windows (passo 1).

## Variáveis de ambiente

| Variável                               | Onde                   | Obrigatória | Para quê                                                                                                            |
| -------------------------------------- | ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                    | `.env`, no build       | sim         | Cliente Supabase do navegador (embutida no bundle)                                                                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY`        | `.env`, no build       | sim         | Idem; é a chave pública                                                                                             |
| `project_id`                           | `supabase/config.toml` | sim         | Vira `VITE_SUPABASE_PROJECT_ID`, usado pelo servidor MCP                                                            |
| `SUPABASE_URL`                         | segredo do Worker      | sim         | Server functions e API do assistente                                                                                |
| `SUPABASE_PUBLISHABLE_KEY`             | segredo do Worker      | sim         | Idem                                                                                                                |
| `SUPABASE_SERVICE_ROLE_KEY`            | segredo do Worker      | não         | Só para "excluir minha conta": sem ela, os dados são apagados, mas o login não é removido e a ação termina com erro |
| `GEMINI_API_KEY`                       | segredo do Worker      | não         | Recursos de IA; sem chave, o app funciona sem eles                                                                  |
| `IA_PROVEDOR`                          | segredo do Worker      | não         | `gemini` (padrão) ou `anthropic`                                                                                    |
| `GEMINI_MODEL`                         | segredo do Worker      | não         | Padrão `gemini-3.1-flash-lite`                                                                                      |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | segredo do Worker      | não         | Provedor pago; fora do custo zero                                                                                   |

As variáveis `VITE_*` são públicas por definição: vão para o bundle do
navegador. Nada com `SERVICE_ROLE` ou chave de IA pode ter o prefixo `VITE_`.

## Passo a passo

1. **Build.** No Windows, o `@lovable.dev/mcp-js` quebra o `vite build` por
   causa do separador de caminho. Faça o build num contêiner Linux, a partir da
   raiz do projeto (PowerShell):

   ```powershell
   docker run --rm -v "${PWD}:/app" -v hf_node_modules:/app/node_modules -w /app node:22 bash -c "npm ci && npm run build"
   ```

   Em Linux, macOS ou WSL, basta `npm ci && npm run build`.

2. **Login na Cloudflare** (abre o navegador):

   ```bash
   npx wrangler login
   ```

3. **Primeiro deploy**, a partir da pasta gerada:

   ```bash
   cd .output/server
   npx wrangler deploy
   ```

   O nome do Worker vem de `.output/server/wrangler.json`. O endereço final
   aparece no terminal, no formato `https://<nome>.<sua-conta>.workers.dev`.

4. **Segredos**, na mesma pasta. Cada comando pede o valor e publica uma nova
   versão:

   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler secret put GEMINI_API_KEY
   ```

   Também dá para fazer pelo dashboard: Workers & Pages > o Worker > Settings >
   Variables and Secrets.

5. **Supabase Auth.** No dashboard do projeto, em Authentication > URL
   Configuration, troque a Site URL pelo endereço do passo 3 e adicione esse
   endereço às Redirect URLs. A Site URL é usada nos links de confirmação de
   e-mail ([documentação](https://supabase.com/docs/guides/auth/redirect-urls)).

6. **Teste o fluxo:** criar conta por e-mail, importar um CSV, categorizar,
   abrir o dashboard e perguntar ao assistente.

7. **Confira o limite de CPU.** No dashboard da Cloudflare, abra as métricas do
   Worker (CPU time e erros) depois de usar o app. Se aparecer o erro 1102 com
   frequência, o plano Free não basta para o SSR deste app.

Para atualizar depois, repita os passos 1 e 3. Os segredos ficam no Worker.
