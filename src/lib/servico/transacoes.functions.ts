/** Transações: listagem, correção de categoria, limpeza e reclassificação. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { categorizar } from "@/lib/categorize/engine";
import type { TipoTransacao, Transacao } from "@/lib/types/dominio";

import { buscarRegras } from "./compartilhado";

export const listarTransacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mes: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        categoriaId: z.string().uuid().nullable().optional(),
        busca: z.string().trim().max(60).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<Transacao[]> => {
    let query = context.supabase
      .from("transacoes")
      .select("id, conta_id, data, descricao, valor, tipo, categoria_id, categoria_origem, origem")
      .order("data", { ascending: false })
      .limit(500);

    if (data.mes) {
      const inicio = `${data.mes}-01`;
      const [ano, mes] = data.mes.split("-").map(Number) as [number, number];
      const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
      query = query.gte("data", inicio).lt("data", fim);
    }
    if (data.categoriaId) query = query.eq("categoria_id", data.categoriaId);
    if (data.busca) query = query.ilike("descricao", `%${data.busca}%`);

    const { data: linhas, error } = await query;
    if (error) throw new Error("Não foi possível carregar as transações.");

    return (linhas ?? []).map((t) => ({
      id: t.id,
      contaId: t.conta_id,
      data: t.data,
      descricao: t.descricao,
      valor: Number(t.valor),
      tipo: t.tipo as TipoTransacao,
      categoriaId: t.categoria_id,
      categoriaOrigem: t.categoria_origem,
      origem: t.origem,
    }));
  });

export const atualizarCategoriaTransacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), categoriaId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Correção manual: a origem passa a `usuario` e não volta atrás sozinha.
    const { error } = await context.supabase
      .from("transacoes")
      .update({ categoria_id: data.categoriaId, categoria_origem: "usuario" })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível atualizar a categoria.");
    return { ok: true };
  });

/** Quantas transações importadas (CSV ou PDF) existem, para o diálogo de confirmação. */
export const contarTransacoesImportadas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ total: number }> => {
    const { count, error } = await context.supabase
      .from("transacoes")
      .select("id", { count: "exact", head: true })
      .in("origem", ["CSV", "PDF"]);
    if (error) throw new Error("Não foi possível contar as transações importadas.");
    return { total: count ?? 0 };
  });

/**
 * Apaga só o que veio de arquivo importado (origem CSV ou PDF). Lançamentos
 * manuais e regras de categorização ficam de pé — é uma limpeza de importação,
 * não o direito ao esquecimento de `excluirMinhaConta`.
 */
export const excluirTransacoesImportadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ apagadas: number }> => {
    const { data, error } = await context.supabase
      .from("transacoes")
      .delete()
      .in("origem", ["CSV", "PDF"])
      .select("id");
    if (error) throw new Error("Não foi possível apagar as transações importadas.");
    return { apagadas: data?.length ?? 0 };
  });

export const reclassificarTudo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const regras = await buscarRegras(context.supabase as never);
    const { data: transacoes, error } = await context.supabase
      .from("transacoes")
      .select("id, descricao, categoria_id")
      .is("categoria_id", null)
      .limit(2000);
    if (error) throw new Error("Não foi possível reclassificar.");

    let atualizadas = 0;
    for (const t of transacoes ?? []) {
      const categoriaId = categorizar(t.descricao, regras);
      if (!categoriaId) continue;
      const { error: erroUpdate } = await context.supabase
        .from("transacoes")
        .update({ categoria_id: categoriaId, categoria_origem: "sistema" })
        .eq("id", t.id);
      if (!erroUpdate) atualizadas += 1;
    }
    return { atualizadas };
  });
