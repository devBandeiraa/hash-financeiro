/** Categorias e regras de categorização. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Categoria, RegraCategorizacao } from "@/lib/types/dominio";

import { buscarRegras } from "./compartilhado";

export const listarCategorias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Categoria[]> => {
    const { data, error } = await context.supabase
      .from("categorias")
      .select("id, nome, cor, usuario_id")
      .order("nome", { ascending: true });
    if (error) throw new Error("Não foi possível carregar as categorias.");
    return (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      cor: c.cor,
      usuarioId: c.usuario_id,
    }));
  });

export const listarRegras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RegraCategorizacao[]> =>
    buscarRegras(context.supabase as never),
  );

export const criarRegra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        palavraChave: z.string().trim().min(2).max(60),
        categoriaId: z.string().uuid(),
        prioridade: z.number().int().min(1).max(1000).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("regras_categorizacao").insert({
      usuario_id: context.userId,
      palavra_chave: data.palavraChave,
      categoria_id: data.categoriaId,
      prioridade: data.prioridade,
    });
    if (error) throw new Error("Não foi possível criar a regra.");
    return { ok: true };
  });

export const excluirRegra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("regras_categorizacao")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir a regra.");
    return { ok: true };
  });
