/** Resumo mensal do dashboard. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ResumoDashboard {
  mes: string;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  porCategoria: Array<{ categoriaId: string | null; nome: string; cor: string; total: number }>;
  serieDiaria: Array<{ data: string; saidas: number }>;
  naoCategorizadas: number;
  totalTransacoes: number;
}

export const resumoDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ResumoDashboard> => {
    const inicio = `${data.mes}-01`;
    const [ano, mes] = data.mes.split("-").map(Number) as [number, number];
    const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

    const [{ data: transacoes, error }, { data: categorias }] = await Promise.all([
      context.supabase
        .from("transacoes")
        .select("data, valor, tipo, categoria_id")
        .gte("data", inicio)
        .lt("data", fim),
      context.supabase.from("categorias").select("id, nome, cor"),
    ]);
    if (error) throw new Error("Não foi possível carregar o resumo.");

    const mapaCategorias = new Map(
      (categorias ?? []).map((c) => [c.id, { nome: c.nome, cor: c.cor }]),
    );

    let totalEntradas = 0;
    let totalSaidas = 0;
    let naoCategorizadas = 0;
    const porCategoria = new Map<string | null, number>();
    const serie = new Map<string, number>();

    for (const t of transacoes ?? []) {
      const valor = Number(t.valor);
      if (t.tipo === "CREDITO") {
        totalEntradas += valor;
        continue;
      }
      totalSaidas += valor;
      if (!t.categoria_id) naoCategorizadas += 1;
      porCategoria.set(t.categoria_id, (porCategoria.get(t.categoria_id) ?? 0) + valor);
      serie.set(t.data, (serie.get(t.data) ?? 0) + valor);
    }

    const arredondar = (n: number) => Math.round(n * 100) / 100;

    return {
      mes: data.mes,
      totalEntradas: arredondar(totalEntradas),
      totalSaidas: arredondar(totalSaidas),
      saldo: arredondar(totalEntradas - totalSaidas),
      porCategoria: [...porCategoria.entries()]
        .map(([categoriaId, total]) => ({
          categoriaId,
          nome: categoriaId ? (mapaCategorias.get(categoriaId)?.nome ?? "—") : "Não categorizado",
          cor: categoriaId ? (mapaCategorias.get(categoriaId)?.cor ?? "#94a3b8") : "#94a3b8",
          total: arredondar(total),
        }))
        .sort((a, b) => b.total - a.total),
      serieDiaria: [...serie.entries()]
        .map(([dia, saidas]) => ({ data: dia, saidas: arredondar(saidas) }))
        .sort((a, b) => a.data.localeCompare(b.data)),
      naoCategorizadas,
      totalTransacoes: transacoes?.length ?? 0,
    };
  });
