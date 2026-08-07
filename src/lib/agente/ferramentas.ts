/**
 * Ferramentas do agente interno — a mesma lógica do servidor MCP, sem OAuth.
 *
 * A Fase 0 apontou que MCP e app convergem no mesmo objeto: um client Supabase
 * autenticado como o usuário. O agente interno pega esse client do middleware
 * de sessão, então não faz sentido dar a volta pelo OAuth do próprio servidor.
 *
 * SEGURANÇA: o `userId` vem sempre da sessão autenticada. O modelo escolhe
 * *qual* ferramenta chamar e com que argumentos, nunca *de quem* é o dado.
 */
import { z } from "zod";

import { CAPACIDADES, type CapacidadeExecutavel } from "@/lib/capacidades";

/** Descrição de uma ferramenta, independente de provedor de modelo. */
export interface FerramentaAgente {
  nome: string;
  descricao: string;
  /** Schema dos argumentos, já como `z.object` — o provedor converte. */
  esquema: z.ZodObject<z.ZodRawShape>;
  /** Escrita nunca executa direto: vira proposta (Fase B3). */
  exigeConfirmacao: boolean;
}

function comoFerramenta(capacidade: CapacidadeExecutavel): FerramentaAgente {
  return {
    nome: capacidade.nome,
    descricao: capacidade.descricao,
    esquema: z.object(capacidade.entrada),
    exigeConfirmacao: capacidade.natureza === "escrita",
  };
}

/** Catálogo que o modelo enxerga. */
export const FERRAMENTAS_AGENTE: FerramentaAgente[] = CAPACIDADES.map(comoFerramenta);

export function ferramentaPorNome(nome: string): FerramentaAgente | undefined {
  return FERRAMENTAS_AGENTE.find((f) => f.nome === nome);
}

/** Só as de leitura podem rodar sem passar pelo usuário. */
export function ehLeitura(nome: string): boolean {
  return ferramentaPorNome(nome)?.exigeConfirmacao === false;
}
