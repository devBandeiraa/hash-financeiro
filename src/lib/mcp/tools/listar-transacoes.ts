import { z } from "zod";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { resultadoJson } from "../resultado";

export const listarTransacoesTool = defineTool({
  name: "listar_transacoes",
  title: "Listar transações",
  description:
    "Lista transações do usuário com filtros opcionais por período, conta, categoria e texto na descrição. Use para responder perguntas sobre lançamentos específicos.",
  inputSchema: {
    dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Data inicial (AAAA-MM-DD)."),
    dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Data final (AAAA-MM-DD)."),
    contaId: z.string().uuid().optional().describe("Filtra por conta."),
    categoriaId: z.string().uuid().optional().describe("Filtra por categoria."),
    busca: z.string().min(1).optional().describe("Texto contido na descrição."),
    limite: z.number().int().min(1).max(200).optional().describe("Máximo de itens (padrão 50)."),
  },
  outputSchema: undefined,
  handler: async (args, ctx: ToolContext) => {
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("transacoes")
      .select("id, data, descricao, valor, tipo, conta_id, categoria_id, origem")
      .order("data", { ascending: false })
      .limit(args.limite ?? 50);

    if (args.dataInicio) query = query.gte("data", args.dataInicio);
    if (args.dataFim) query = query.lte("data", args.dataFim);
    if (args.contaId) query = query.eq("conta_id", args.contaId);
    if (args.categoriaId) query = query.eq("categoria_id", args.categoriaId);
    if (args.busca) query = query.ilike("descricao", `%${args.busca}%`);

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao listar transações: ${error.message}`);

    return resultadoJson({ total: data?.length ?? 0, transacoes: data ?? [] });
  },
});
