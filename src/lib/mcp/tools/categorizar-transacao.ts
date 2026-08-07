import { z } from "zod";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { resultadoJson } from "../resultado";

export const categorizarTransacaoTool = defineTool({
  name: "categorizar_transacao",
  title: "Categorizar transação",
  description:
    "Altera a categoria de uma transação existente. Útil para corrigir classificações erradas feitas pelo motor automático.",
  inputSchema: {
    transacaoId: z.string().uuid().describe("ID da transação a atualizar."),
    categoriaId: z
      .string()
      .uuid()
      .nullable()
      .describe("ID da nova categoria, ou null para remover a categoria."),
  },
  outputSchema: undefined,
  handler: async (args, ctx: ToolContext) => {
    const supabase = supabaseForUser(ctx);

    // Vem de uma acao explicita do usuario via MCP -- origem `usuario`.
    const { data, error } = await supabase
      .from("transacoes")
      .update({ categoria_id: args.categoriaId, categoria_origem: "usuario" })
      .eq("id", args.transacaoId)
      .select("id, descricao, categoria_id, categoria_origem")
      .maybeSingle();

    if (error) throw new Error(`Erro ao categorizar: ${error.message}`);
    if (!data) throw new Error("Transação não encontrada para este usuário");

    return resultadoJson({ atualizada: true, transacao: data });
  },
});
