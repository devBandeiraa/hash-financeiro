/**
 * Ponte entre o servidor MCP (autenticado por OAuth) e as capacidades.
 *
 * O MCP contribui apenas com a identidade: `supabaseForUser` cria um client
 * com o token verificado, e o RLS do banco faz o resto. A regra de negócio
 * vive em `@/lib/capacidades` e é a mesma que o agente interno usa.
 */
import { defineTool, type ToolContext, type ToolDefinition } from "@lovable.dev/mcp-js";

import type { CapacidadeExecutavel, ContextoCapacidade } from "@/lib/capacidades";
import { supabaseForUser } from "./supabase";
import { resultadoJson } from "./resultado";

/** Monta o contexto a partir do token OAuth já verificado pelo SDK. */
export function contextoDoMcp(ctx: ToolContext): ContextoCapacidade {
  const userId = ctx.getUserId();
  if (!userId) throw new Error("Chamada sem usuário autenticado");
  return { supabase: supabaseForUser(ctx), userId };
}

/** Expõe uma capacidade como ferramenta MCP, preservando nome e schema. */
export function comoFerramentaMcp(
  capacidade: CapacidadeExecutavel,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ToolDefinition<any, any> {
  return defineTool({
    name: capacidade.nome,
    title: capacidade.titulo,
    description: capacidade.descricao,
    inputSchema: capacidade.entrada,
    outputSchema: undefined,
    handler: async (args: unknown, ctx: ToolContext) =>
      resultadoJson(await capacidade.executar(contextoDoMcp(ctx), args as never)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as unknown as ToolDefinition<any, any>;
}
