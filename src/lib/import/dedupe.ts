/**
 * Hash de deduplicação de transação.
 * Fórmula: sha256(usuarioId | contaId | data | valor | tipo | descricaoNormalizada)
 * O banco tem UNIQUE(usuario_id, hash_dedupe) — o hash é a primeira barreira,
 * a constraint é a garantia final.
 */
import { normalizarDescricao } from "./normalize";
import type { TipoTransacao } from "@/lib/types/dominio";

export interface EntradaHash {
  usuarioId: string;
  contaId: string;
  data: string;
  valor: number;
  tipo: TipoTransacao;
  descricao: string;
}

export async function calcularHashDedupe(entrada: EntradaHash): Promise<string> {
  const base = [
    entrada.usuarioId,
    entrada.contaId,
    entrada.data,
    entrada.valor.toFixed(2),
    entrada.tipo,
    normalizarDescricao(entrada.descricao),
  ].join("|");

  const bytes = new TextEncoder().encode(base);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
