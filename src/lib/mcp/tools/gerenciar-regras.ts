/**
 * `gerenciar_regras` junta duas capacidades num só nome. Mantido assim porque
 * clientes MCP externos já dependem deste contrato — internamente o agente
 * usa `listar_regras` e `criar_regra` separadas, que é o que a Fase B3 precisa
 * para saber o que exige confirmação.
 */
import { z } from "zod";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

import { criarRegra, listarRegras } from "@/lib/capacidades";
import { contextoDoMcp } from "../adaptador";
import { resultadoJson } from "../resultado";

export const gerenciarRegrasTool = defineTool({
  name: "gerenciar_regras",
  title: "Gerenciar regras de categorização",
  description:
    "Lista as regras de categorização automática (palavra-chave → categoria) ou cria uma nova regra do usuário. Regras com maior prioridade vencem no motor de categorização.",
  inputSchema: {
    acao: z
      .enum(["listar", "criar"])
      .describe("listar para consultar regras, criar para adicionar uma nova."),
    palavraChave: z.string().min(2).max(60).optional().describe("Obrigatório quando acao=criar."),
    categoriaId: z.string().uuid().optional().describe("Obrigatório quando acao=criar."),
    prioridade: z.number().int().min(0).max(1000).optional().describe("Padrão 100."),
  },
  outputSchema: undefined,
  handler: async (args, ctx: ToolContext) => {
    const contexto = contextoDoMcp(ctx);

    if (args.acao === "listar") {
      return resultadoJson(await listarRegras.executar(contexto));
    }

    if (!args.palavraChave || !args.categoriaId) {
      throw new Error("palavraChave e categoriaId são obrigatórios para criar uma regra");
    }

    return resultadoJson(
      await criarRegra.executar(contexto, {
        palavraChave: args.palavraChave,
        categoriaId: args.categoriaId,
        ...(args.prioridade === undefined ? {} : { prioridade: args.prioridade }),
      }),
    );
  },
});
