/**
 * Motor de categorização por regras — função pura, determinística.
 *
 * Ordem: regras do usuário antes das default, depois por `prioridade` (menor
 * primeiro). Primeiro match vence. Sem match -> null (não categorizado).
 * Trocar por IA no futuro = substituir esta implementação, não a arquitetura.
 */
import { normalizarDescricao } from "@/lib/import/normalize";
import type { RegraCategorizacao } from "@/lib/types/dominio";

export function ordenarRegras(regras: RegraCategorizacao[]): RegraCategorizacao[] {
  return [...regras]
    .filter((r) => r.ativa)
    .sort((a, b) => {
      const escopo = Number(a.usuarioId === null) - Number(b.usuarioId === null);
      if (escopo !== 0) return escopo; // regras do usuário primeiro
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
      return b.palavraChave.length - a.palavraChave.length; // mais específica ganha
    });
}

/** Devolve o categoriaId da primeira regra que casa, ou null. */
export function categorizar(
  descricao: string,
  regras: RegraCategorizacao[],
): string | null {
  const alvo = normalizarDescricao(descricao);
  if (!alvo) return null;

  for (const regra of ordenarRegras(regras)) {
    const chave = normalizarDescricao(regra.palavraChave);
    if (chave && alvo.includes(chave)) return regra.categoriaId;
  }
  return null;
}
