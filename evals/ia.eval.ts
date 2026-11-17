/**
 * Modo 2: motor de regras + fallback de IA, pelo mesmo caminho do app: só o
 * que as regras não pegaram vai para `sugerirCategorias`, com a lista
 * completa de categorias, e "Não categorizado" do modelo é descartado.
 *
 * Consome cota do provedor configurado no `.env` (GEMINI_API_KEY ou
 * ANTHROPIC_API_KEY). Sem chave, o teste é pulado. Fica fora do CI.
 */
import { it } from "vitest";

import { iaConfigurada, provedorAtivo } from "../src/lib/ai/modelo.server";
import { sugerirCategorias } from "../src/lib/categorize/ai/sugerir.server";
import {
  avaliar,
  carregarConjunto,
  carregarDominio,
  gravarRelatorio,
  hoje,
  preverPorRegras,
  relatorio,
} from "./conjunto";

async function modeloEmUso(): Promise<string> {
  const provedor = provedorAtivo();
  if (provedor === "gemini") {
    const { MODELO_PADRAO } = await import("../src/lib/ai/provedores/gemini.server");
    return `gemini / ${process.env["GEMINI_MODEL"]?.trim() || MODELO_PADRAO}`;
  }
  if (provedor === "anthropic") {
    const { MODELO_PADRAO } = await import("../src/lib/ai/provedores/anthropic.server");
    return `anthropic / ${process.env["ANTHROPIC_MODEL"]?.trim() || MODELO_PADRAO}`;
  }
  return "nenhum";
}

it.skipIf(!iaConfigurada())(
  "regras + fallback de IA: taxa de acerto no conjunto rotulado",
  async () => {
    const dominio = await carregarDominio();
    const itens = carregarConjunto(dominio.categorias);
    const previstas = preverPorRegras(itens, dominio);

    const semRegra = itens.filter((i) => previstas.get(i.id) === null);
    const sugestoes = await sugerirCategorias(
      semRegra.map((i) => i.descricao),
      dominio.categorias,
    );
    const porDescricao = new Map(sugestoes.map((s) => [s.descricao, s.categoria]));
    for (const item of semRegra) {
      previstas.set(item.id, porDescricao.get(item.descricao.trim()) ?? null);
    }

    const resultado = avaliar("regras + fallback de IA", itens, previstas);
    const texto = relatorio(resultado, { data: hoje(), modelo: await modeloEmUso() });
    const caminho = gravarRelatorio("regras-ia.md", texto);

    console.log(texto.split("## Erros")[0]);
    console.log(`Descrições enviadas à IA: ${semRegra.length}`);
    console.log(`Relatório completo: ${caminho}`);
  },
  300_000,
);
