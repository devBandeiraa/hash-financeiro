/**
 * Aplicação das sugestões de IA já confirmadas pelo usuário.
 *
 * Vive fora da server function para ser testável com um Supabase falso: é o
 * código mais perigoso da Fase A3 (escreve categoria E cria regra que passa a
 * governar todo import futuro), e era justamente o que não tinha cobertura.
 *
 * O isolamento por usuário continua sendo do RLS — este módulo nunca filtra
 * por `usuario_id` em leitura, e o `userId` que ele grava vem da sessão.
 */
import { extrairPalavraChave } from "./palavra-chave";
import type { ResultadoSugestoesIa } from "@/lib/types/dominio";

/** Prioridade das regras nascidas de IA — perde para regra escrita à mão (10). */
export const PRIORIDADE_REGRA_IA = 200;

export interface SugestaoAceita {
  descricao: string;
  categoriaId: string;
  criarRegra: boolean;
}

/**
 * Só o que usamos do client do Supabase — o suficiente para injetar um duplo
 * nos testes sem arrastar o schema inteiro.
 *
 * O `any` é deliberado: o query builder do PostgREST é encadeável e genérico
 * demais para descrever estruturalmente sem reimplementá-lo, e tipá-lo a menos
 * faria o client real deixar de casar. Mesmo escape já usado em `buscarRegras`.
 */
export interface SupabaseMinimo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(tabela: string): any;
}

export async function aplicarSugestoes(
  supabase: SupabaseMinimo,
  userId: string,
  aceitas: SugestaoAceita[],
): Promise<ResultadoSugestoesIa> {
  // O id da categoria vem do cliente: só vale se o usuário puder vê-la.
  // A RLS de `categorias` já filtra o SELECT — aqui só confirmamos.
  const { data: cats } = await supabase.from("categorias").select("id");
  const visiveis = new Set(((cats ?? []) as Array<{ id: string }>).map((c) => c.id));

  let transacoesAtualizadas = 0;
  let regrasCriadas = 0;
  let regrasAtualizadas = 0;

  for (const aceita of aceitas) {
    if (!visiveis.has(aceita.categoriaId)) continue;

    // `is null` mantém a operação idempotente: nunca sobrescreve categoria que
    // o motor ou o usuário tenham definido entre a prévia e o aceite.
    const { data: afetadas, error } = await supabase
      .from("transacoes")
      .update({ categoria_id: aceita.categoriaId, categoria_origem: "ia" })
      .eq("descricao", aceita.descricao)
      .is("categoria_id", null)
      .select("id");
    if (error) throw new Error("Não foi possível aplicar as sugestões.");
    transacoesAtualizadas += afetadas?.length ?? 0;

    if (!aceita.criarRegra) continue;

    const palavraChave = extrairPalavraChave(aceita.descricao);
    if (!palavraChave) continue;

    const { data: existente } = await supabase
      .from("regras_categorizacao")
      .select("id")
      .eq("usuario_id", userId)
      .eq("palavra_chave", palavraChave)
      .maybeSingle();

    if (existente) {
      const { error: erroUpdate } = await supabase
        .from("regras_categorizacao")
        .update({ categoria_id: aceita.categoriaId, origem: "ia", ativa: true })
        .eq("id", existente.id);
      if (!erroUpdate) regrasAtualizadas += 1;
      continue;
    }

    const { error: erroInsert } = await supabase.from("regras_categorizacao").insert({
      usuario_id: userId,
      palavra_chave: palavraChave,
      categoria_id: aceita.categoriaId,
      prioridade: PRIORIDADE_REGRA_IA,
      origem: "ia",
    });
    if (!erroInsert) regrasCriadas += 1;
  }

  return { transacoesAtualizadas, regrasCriadas, regrasAtualizadas };
}
