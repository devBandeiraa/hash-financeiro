/**
 * Modo 1: só o motor de regras. Determinístico, sem rede e sem cota — roda no
 * CI com um limite mínimo, que serve de trava contra regressão (não é meta).
 */
import { expect, it } from "vitest";

import {
  avaliar,
  carregarConjunto,
  carregarDominio,
  gravarRelatorio,
  hoje,
  preverPorRegras,
  relatorio,
} from "./conjunto";

/**
 * Piso de acerto geral do modo só regras: a medição de 17/11/2026 deu 55/203
 * (27,1%). O motor é determinístico, então qualquer queda abaixo disso é
 * regressão e o CI falha. É trava, não meta: subir o número exige medir de
 * novo, não ajustar regras ao conjunto.
 */
const MINIMO_ACERTO = 0.27;

it("motor de regras: taxa de acerto no conjunto rotulado", async () => {
  const dominio = await carregarDominio();
  const itens = carregarConjunto(dominio.categorias);

  const resultado = avaliar("só motor de regras", itens, preverPorRegras(itens, dominio));
  const texto = relatorio(resultado, { data: hoje(), modelo: "nenhum (determinístico)" });
  const caminho = gravarRelatorio("regras.md", texto);

  console.log(texto.split("## Erros")[0]);
  console.log(`Relatório completo: ${caminho}`);

  expect(resultado.acertos / resultado.total).toBeGreaterThanOrEqual(MINIMO_ACERTO);
});
