/** Contas bancárias do usuário. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Conta, TipoConta } from "@/lib/types/dominio";

export const listarContas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Conta[]> => {
    const { data, error } = await context.supabase
      .from("contas")
      .select("id, nome, tipo")
      .order("criado_em", { ascending: true });
    if (error) throw new Error("Não foi possível carregar as contas.");
    return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo as TipoConta }));
  });

export const criarConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nome: z.string().trim().min(1).max(60),
        tipo: z.enum(["CORRENTE", "POUPANCA", "CARTAO"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Conta> => {
    const { data: criada, error } = await context.supabase
      .from("contas")
      .insert({ nome: data.nome, tipo: data.tipo, usuario_id: context.userId })
      .select("id, nome, tipo")
      .single();
    if (error || !criada) throw new Error("Não foi possível criar a conta.");
    return { id: criada.id, nome: criada.nome, tipo: criada.tipo as TipoConta };
  });

/**
 * Apaga uma conta do usuário. `ON DELETE CASCADE` no banco já leva junto todas
 * as transações dessa conta — não precisa apagar linha por linha aqui.
 */
export const excluirConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contas").delete().eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir a conta.");
    return { ok: true };
  });
