import { defineMcp, auth, type ToolDefinition } from "@lovable.dev/mcp-js";
import { listarContasCategoriasTool } from "./tools/listar-contas-categorias";
import { resumoDashboardTool } from "./tools/resumo-dashboard";
import { listarTransacoesTool } from "./tools/listar-transacoes";
import { criarTransacaoTool } from "./tools/criar-transacao";
import { categorizarTransacaoTool } from "./tools/categorizar-transacao";
import { gerenciarRegrasTool } from "./tools/gerenciar-regras";

const ref = import.meta.env["VITE_SUPABASE_PROJECT_REF"];

if (!ref) {
  throw new Error(
    "VITE_SUPABASE_PROJECT_REF nao configurada. Defina a variavel no .env (veja .env.example).",
  );
}

export default defineMcp({
  name: "hash-financeiro-mcp-server",
  title: "Hash Financeiro MCP Server",
  version: "1.0.0",
  instructions:
    "Servidor MCP do Hash Financeiro para gestão financeira pessoal. Permite consultar contas, saldo, transações e resumos mensais, além de criar transações manuais, gerenciar regras e recategorizar lançamentos com isolamento de dados por usuário via Row Level Security (RLS).",
  auth: auth.oauth.issuer({
    issuer: `https://${ref}.supabase.co/auth/v1`,
    acceptedAudiences: ["authenticated"],
  }),
  tools: [
    listarContasCategoriasTool,
    resumoDashboardTool,
    listarTransacoesTool,
    criarTransacaoTool,
    categorizarTransacaoTool,
    gerenciarRegrasTool,
  ] as unknown as readonly ToolDefinition<any, any>[],
});
