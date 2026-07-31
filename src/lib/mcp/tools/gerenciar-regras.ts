import { z } from "zod";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { resultadoJson } from "../resultado";

export const gerenciarRegrasTool = defineTool({
  name: "gerenciar_regras",
  title: "Gerenciar regras de categorização",
  description:
    "Lista as regras de categorização automática (palavra-chave → categoria) ou cria uma nova regra do usuário. Regras com maior prioridade vencem no motor de categorização.",
  inputSchema: {
    acao: z.enum(["listar", "criar"]).describe("listar para consultar regras, criar para adicionar uma nova."),
    palavraChave: z.string().min(2).max(60).optional().describe("Obrigatório quando acao=criar."),
    categoriaId: z.string().uuid().optional().describe("Obrigatório quando acao=criar."),
    prioridade: z.number().int().min(0).max(1000).optional().describe("Padrão 100."),
  },
  outputSchema: undefined,
  handler: async (args, ctx: ToolContext) => {
    const supabase = supabaseForUser(ctx);

    if (args.acao === "listar") {
      const { data, error } = await supabase
        .from("regras_categorizacao")
        .select("id, palavra_chave, categoria_id, prioridade, ativa, usuario_id")
        .order("prioridade", { ascending: false });
      if (error) throw new Error(`Erro ao listar regras: ${error.message}`);
      return resultadoJson({ total: data?.length ?? 0, regras: data ?? [] });
    }

    const usuarioId = ctx.getUserId();
    if (!usuarioId) throw new Error("Chamada sem usuário autenticado");
    if (!args.palavraChave || !args.categoriaId) {
      throw new Error("palavraChave e categoriaId são obrigatórios para criar uma regra");
    }

    const { data, error } = await supabase
      .from("regras_categorizacao")
      .insert({
        usuario_id: usuarioId,
        palavra_chave: args.palavraChave.toUpperCase(),
        categoria_id: args.categoriaId,
        prioridade: args.prioridade ?? 100,
        ativa: true,
      })
      .select("id, palavra_chave, categoria_id, prioridade, ativa")
      .single();

    if (error) throw new Error(`Erro ao criar regra: ${error.message}`);
    return resultadoJson({ criada: true, regra: data });
  },
});
