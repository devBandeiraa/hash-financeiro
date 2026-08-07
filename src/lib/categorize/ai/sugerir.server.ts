/**
 * Sugestão de categoria por IA — o *fallback* do motor determinístico.
 *
 * Espelha `categorize/engine.ts`: as funções de montagem de prompt e de
 * interpretação da resposta são puras e testáveis; só `sugerirCategorias`
 * toca a rede. O motor de regras roda ANTES e não é afetado por nada aqui.
 *
 * LGPD: sai daqui apenas a *descrição* do lançamento. Nunca valor, saldo,
 * data, conta, titular ou id. A montagem do prompt é o ponto onde essa
 * garantia é verificável — não passe mais nada para `montarPrompt`.
 */
import * as z from "zod/v4";

import { chamarModelo, IaIndisponivelError, parseJsonSeguro } from "@/lib/ai/modelo.server";
import type { PedidoModelo } from "@/lib/ai/modelo.server";
import { normalizarDescricao } from "@/lib/import/normalize";

/**
 * Escape do modelo quando não tem certeza. Sugestões nesta categoria são
 * descartadas: o lançamento já estava sem categoria, então repetir isso não
 * é informação — e viraria uma regra inútil na promoção da Fase A3.
 */
export const CATEGORIA_INCERTA = "Não categorizado";

/** Quantas descrições por chamada. Lotes menores = resposta mais confiável. */
const TAMANHO_LOTE = 50;

export interface Sugestao {
  descricao: string;
  categoria: string;
}

/** Assinatura do modelo, injetável para testar sem rede e sem cota. */
export type ChamarModelo = (pedido: PedidoModelo) => Promise<string>;

export interface OpcoesSugestao {
  chamar?: ChamarModelo;
  tamanhoLote?: number;
}

/**
 * Schema de LEITURA: `categoria` é string solta de propósito. Se fosse enum,
 * uma única categoria alucinada reprovaria o lote inteiro; solto, o item ruim
 * é descartado sozinho em `interpretarResposta` e o resto sobrevive.
 */
const EsquemaLeitura = z.object({
  sugestoes: z.array(z.object({ descricao: z.string(), categoria: z.string() })),
});

/**
 * Schema de SAÍDA, mandado ao provedor: aqui `categoria` é enum. Com saída
 * estruturada o modelo fica impedido de inventar categoria na origem, em vez
 * de a gente filtrar depois. As duas defesas coexistem — a de leitura cobre
 * provedor que ignore o schema.
 */
function esquemaSaida(categorias: string[]) {
  const opcoes = [...new Set([...categorias, CATEGORIA_INCERTA])] as [string, ...string[]];
  return z.object({
    sugestoes: z.array(z.object({ descricao: z.string(), categoria: z.enum(opcoes) })),
  });
}

/**
 * Prompt do apêndice B. `user` contém só descrições — é a fronteira de dado
 * que sai do sistema.
 */
export function montarPrompt(
  descricoes: string[],
  categorias: string[],
): { system: string; user: string } {
  const system = [
    "Você categoriza transações financeiras. Receberá uma lista de descrições e deve",
    `classificar cada uma em EXATAMENTE uma destas categorias: ${categorias.join(", ")}.`,
    "",
    'Responda SOMENTE com JSON no formato {"sugestoes":[{"descricao":"...","categoria":"..."}]},',
    "sem texto antes ou depois. Repita a descrição exatamente como recebida.",
    `Use "${CATEGORIA_INCERTA}" quando não tiver certeza — é preferível a um palpite errado.`,
  ].join("\n");

  return { system, user: descricoes.join("\n") };
}

/**
 * Valida a resposta do modelo contra o que foi pedido. Descarta tudo que não
 * bate: categoria fora da lista, descrição que não foi enviada, duplicata e
 * o escape de incerteza. JSON quebrado devolve vazio — nunca lança.
 */
export function interpretarResposta(
  texto: string,
  descricoes: string[],
  categorias: string[],
): Sugestao[] {
  const bruto = parseJsonSeguro(texto);
  if (!bruto) return [];

  // Aceita tanto {sugestoes:[...]} quanto o array cru, caso o modelo encurte.
  const analisado = EsquemaLeitura.safeParse(Array.isArray(bruto) ? { sugestoes: bruto } : bruto);
  if (!analisado.success) return [];

  // Volta da forma normalizada para a canônica: o modelo pode mudar caixa/acento.
  const porDescricao = new Map(descricoes.map((d) => [normalizarDescricao(d), d]));
  const porCategoria = new Map(categorias.map((c) => [normalizarDescricao(c), c]));
  const incerta = normalizarDescricao(CATEGORIA_INCERTA);

  const vistas = new Set<string>();
  const sugestoes: Sugestao[] = [];

  for (const item of analisado.data.sugestoes) {
    const chaveDescricao = normalizarDescricao(item.descricao);
    const chaveCategoria = normalizarDescricao(item.categoria);

    const descricao = porDescricao.get(chaveDescricao);
    const categoria = porCategoria.get(chaveCategoria);

    if (!descricao || !categoria) continue; // alucinou fora do conjunto pedido
    if (chaveCategoria === incerta) continue; // sem certeza = sem sugestão
    if (vistas.has(chaveDescricao)) continue; // primeira resposta vence

    vistas.add(chaveDescricao);
    sugestoes.push({ descricao, categoria });
  }

  return sugestoes;
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

/**
 * Sugere categoria para descrições distintas, em lotes.
 *
 * Nunca inventa categoria fora de `categorias`. Lote com resposta ilegível
 * contribui com nada e os demais seguem. Só lança `IaIndisponivelError` se
 * *todos* os lotes falharem — aí é a IA que está fora, e o chamador precisa
 * saber para mostrar isso ao usuário.
 */
export async function sugerirCategorias(
  descricoes: string[],
  categorias: string[],
  opcoes: OpcoesSugestao = {},
): Promise<Sugestao[]> {
  const chamar = opcoes.chamar ?? ((pedido: PedidoModelo) => chamarModelo(pedido));

  const distintas = [...new Set(descricoes.map((d) => d.trim()).filter(Boolean))];
  const validas = categorias.filter(Boolean);
  if (!distintas.length || !validas.length) return [];

  const lotes = emLotes(distintas, opcoes.tamanhoLote ?? TAMANHO_LOTE);
  const sugestoes: Sugestao[] = [];
  let falhas = 0;
  let ultimaFalha: IaIndisponivelError | undefined;

  for (const lote of lotes) {
    const { system, user } = montarPrompt(lote, validas);
    try {
      const texto = await chamar({
        system,
        user,
        esforco: "baixo",
        esquema: esquemaSaida(validas),
      });
      sugestoes.push(...interpretarResposta(texto, lote, validas));
    } catch (erro) {
      if (!(erro instanceof IaIndisponivelError)) throw erro;
      falhas += 1;
      ultimaFalha = erro;
    }
  }

  if (ultimaFalha && falhas === lotes.length) throw ultimaFalha;
  return sugestoes;
}
