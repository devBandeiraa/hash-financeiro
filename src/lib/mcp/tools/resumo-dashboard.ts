import { z } from "zod";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { resultadoJson } from "../resultado";

export const resumoDashboardTool = defineTool({
  name: "resumo_dashboard",
  title: "Resumo financeiro do mês",
  description:
    "Retorna o resumo financeiro de um mês: total de entradas, total de saídas, saldo do período e gastos agrupados por categoria. Use quando o usuário perguntar quanto gastou ou como está o mês.",
  inputSchema: {
    mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .describe("Mês de referência no formato AAAA-MM. Padrão: mês atual."),
  },
  outputSchema: undefined,
  handler: async (args, ctx: ToolContext) => {
    const supabase = supabaseForUser(ctx);

    const mes = args.mes ?? new Date().toISOString().slice(0, 7);
    const partes = mes.split("-").map(Number);
    const ano = partes[0] ?? new Date().getFullYear();
    const mesNum = partes[1] ?? new Date().getMonth() + 1;

    const inicio = new Date(Date.UTC(ano, mesNum - 1, 1)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(ano, mesNum, 0)).toISOString().slice(0, 10);

    const [transacoesRes, categoriasRes] = await Promise.all([
      supabase
        .from("transacoes")
        .select("data, valor, tipo, categoria_id")
        .gte("data", inicio)
        .lte("data", fim),
      supabase.from("categorias").select("id, nome"),
    ]);

    if (transacoesRes.error) throw new Error(`Erro ao buscar transações: ${transacoesRes.error.message}`);
    if (categoriasRes.error) throw new Error(`Erro ao buscar categorias: ${categoriasRes.error.message}`);

    const nomeCategoria = new Map((categoriasRes.data ?? []).map((c) => [c.id, c.nome]));

    let entradas = 0;
    let saidas = 0;
    const porCategoria = new Map<string, number>();

    for (const t of transacoesRes.data ?? []) {
      const valor = Math.abs(Number(t.valor));
      if (t.tipo === "CREDITO") {
        entradas += valor;
      } else {
        saidas += valor;
        const nome = t.categoria_id ? (nomeCategoria.get(t.categoria_id) ?? "Sem categoria") : "Sem categoria";
        porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + valor);
      }
    }

    return resultadoJson({
      mes,
      periodo: { inicio, fim },
      totalTransacoes: transacoesRes.data?.length ?? 0,
      entradas: Number(entradas.toFixed(2)),
      saidas: Number(saidas.toFixed(2)),
      saldo: Number((entradas - saidas).toFixed(2)),
      gastosPorCategoria: [...porCategoria.entries()]
        .map(([categoria, total]) => ({ categoria, total: Number(total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total),
    });
  },
});
