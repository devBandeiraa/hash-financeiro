import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { resultadoJson } from "../resultado";

export const listarContasCategoriasTool = defineTool({
  name: "listar_contas_categorias",
  title: "Listar contas e categorias",
  description:
    "Lista as contas financeiras e as categorias disponíveis para o usuário autenticado. Use esta ferramenta primeiro para obter os IDs necessários nas demais chamadas.",
  inputSchema: {},
  outputSchema: undefined,
  handler: async (_args, ctx: ToolContext) => {
    const supabase = supabaseForUser(ctx);

    const [contasRes, categoriasRes] = await Promise.all([
      supabase.from("contas").select("id, nome, tipo").order("nome", { ascending: true }),
      supabase.from("categorias").select("id, nome, cor").order("nome", { ascending: true }),
    ]);

    if (contasRes.error) throw new Error(`Erro ao buscar contas: ${contasRes.error.message}`);
    if (categoriasRes.error) throw new Error(`Erro ao buscar categorias: ${categoriasRes.error.message}`);

    return resultadoJson({ contas: contasRes.data, categorias: categoriasRes.data });
  },
});
