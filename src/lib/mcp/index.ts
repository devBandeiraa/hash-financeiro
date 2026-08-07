import { defineMcp, auth, type ToolDefinition } from "@lovable.dev/mcp-js";

import {
  categorizarTransacao,
  criarTransacao,
  listarContasCategorias,
  listarTransacoes,
  resumoDashboard,
} from "@/lib/capacidades";
import { comoFerramentaMcp } from "./adaptador";
import { gerenciarRegrasTool } from "./tools/gerenciar-regras";

const ref = import.meta.env["VITE_SUPABASE_PROJECT_ID"];

if (!ref) {
  throw new Error(
    "VITE_SUPABASE_PROJECT_ID nao configurada. Defina a variavel no .env (veja .env.example).",
  );
}

/**
 * As ferramentas são projeções das capacidades em `@/lib/capacidades` — a
 * mesma implementação que o agente interno consome. O que o MCP acrescenta é
 * a autenticação OAuth; o isolamento por usuário continua vindo do RLS.
 */
export default defineMcp({
  name: "hash-financeiro-mcp-server",
  title: "Hash Financeiro MCP Server",
  version: "1.1.0",
  instructions:
    "Servidor MCP do Hash Financeiro para gestão financeira pessoal. Permite consultar contas, saldo, transações e resumos mensais, além de criar transações manuais, gerenciar regras e recategorizar lançamentos com isolamento de dados por usuário via Row Level Security (RLS).",
  auth: auth.oauth.issuer({
    issuer: `https://${ref}.supabase.co/auth/v1`,
    acceptedAudiences: ["authenticated"],
  }),
  tools: [
    comoFerramentaMcp(listarContasCategorias),
    comoFerramentaMcp(resumoDashboard),
    comoFerramentaMcp(listarTransacoes),
    comoFerramentaMcp(criarTransacao),
    comoFerramentaMcp(categorizarTransacao),
    gerenciarRegrasTool,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as unknown as readonly ToolDefinition<any, any>[],
});
