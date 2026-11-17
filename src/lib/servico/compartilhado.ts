/**
 * Apoio compartilhado pelas server functions de `src/lib/servico`: limites de
 * entrada e a leitura das regras de categorização visíveis ao usuário.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { CategoriaOrigem, RegraCategorizacao } from "@/lib/types/dominio";

export const LIMITE_LINHAS = 5000;

/** Teto de lançamentos sem categoria examinados por rodada de IA. */
export const LIMITE_SEM_CATEGORIA = 2000;

/** Teto de descrições distintas mandadas ao modelo — segura custo e cota. */
export const LIMITE_DESCRICOES_IA = 100;

export async function buscarRegras(
  supabase: Pick<SupabaseClient<Database>, "from">,
): Promise<RegraCategorizacao[]> {
  const { data, error } = await supabase
    .from("regras_categorizacao")
    .select("id, usuario_id, palavra_chave, categoria_id, prioridade, ativa, origem");
  if (error) throw new Error("Não foi possível carregar as regras.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r["id"] as string,
    usuarioId: (r["usuario_id"] as string | null) ?? null,
    palavraChave: r["palavra_chave"] as string,
    categoriaId: r["categoria_id"] as string,
    prioridade: r["prioridade"] as number,
    ativa: r["ativa"] as boolean,
    origem: r["origem"] as CategoriaOrigem,
  }));
}
