/**
 * Parser de extrato em PDF. Recebe o TEXTO já extraído do PDF
 * (ver `pdf.extract.ts`) e reaproveita a normalização do CSV.
 *
 * Diferente do CSV, um PDF não tem estrutura de lançamentos: é um formato de
 * layout. A extração aqui é heurística — procura, linha a linha, o padrão
 * "data ... descrição ... valor" típico dos extratos bancários brasileiros.
 * Linhas de cabeçalho, rodapé e saldo são descartadas.
 */
import { normalizarLinha } from "./normalize";
import type { LinhaInvalida, LinhaNormalizada } from "@/lib/types/dominio";

export interface ResultadoParsePdf {
  linhas: LinhaNormalizada[];
  invalidas: LinhaInvalida[];
}

/** Data no início da linha: "03/07/2026", "03/07", "03-07-26". */
const RE_DATA_INICIO = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/;

/** Último valor monetário da linha, com sinal antes ou depois e sufixo D/C. */
const RE_VALOR_FIM =
  /(-)?\s*R?\$?\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})\s*(-)?\s*([DC])?\s*$/i;

/** Linhas que nunca são lançamento. */
const RE_RUIDO =
  /\b(saldo|total|subtotal|extrato|p[áa]gina|per[íi]odo|dispon[íi]vel|limite|ouvidoria|sac\b|cnpj|ag[êe]ncia|conta\s*n|dados\s*do|resumo|lan[çc]amentos\s*futuros)\b/i;

/** Ano de referência para datas sem ano (formato "03/07"). */
function inferirAno(texto: string): number {
  const anos = texto.match(/\b(20\d{2})\b/g);
  if (anos && anos.length > 0) {
    // o ano mais frequente no documento
    const contagem = new Map<string, number>();
    for (const a of anos) contagem.set(a, (contagem.get(a) ?? 0) + 1);
    const [maisComum] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]!;
    return Number(maisComum);
  }
  return new Date().getFullYear();
}

export function parsePdfTexto(texto: string): ResultadoParsePdf {
  const bruto = texto.replace(/\r\n?/g, "\n");
  const ano = inferirAno(bruto);

  const linhas: LinhaNormalizada[] = [];
  const invalidas: LinhaInvalida[] = [];
  let candidatas = 0;

  bruto.split("\n").forEach((linhaBruta, indice) => {
    const linha = linhaBruta.replace(/\s+/g, " ").trim();
    if (!linha) return;

    const mData = linha.match(RE_DATA_INICIO);
    if (!mData) return;
    if (RE_RUIDO.test(linha)) return;

    const resto = linha.slice(mData[0].length).trim();
    const mValor = resto.match(RE_VALOR_FIM);
    if (!mValor) return;

    candidatas += 1;

    const dia = mData[1]!.padStart(2, "0");
    const mes = mData[2]!.padStart(2, "0");
    const anoBruto = mData[3];
    const anoFinal = anoBruto ? (anoBruto.length === 2 ? `20${anoBruto}` : anoBruto) : String(ano);

    const negativo = Boolean(mValor[1] ?? mValor[3]);
    const numero = mValor[2]!;
    const sufixo = mValor[4]?.toUpperCase();

    const descricao = resto
      .slice(0, mValor.index)
      .replace(/[.\s]+$/, "")
      .trim();

    const resultado = normalizarLinha({
      data: `${anoFinal}-${mes}-${dia}`,
      descricao,
      valor: negativo ? `-${numero}` : numero,
      ...(sufixo ? { tipo: sufixo } : {}),
    });

    if (resultado.ok) linhas.push(resultado.linha);
    else invalidas.push({ linha: indice + 1, motivo: resultado.motivo });
  });

  if (candidatas === 0) {
    throw new Error(
      "Nenhum lançamento reconhecido no PDF. Se o arquivo for digitalizado (imagem), " +
        "não há texto para ler — exporte o extrato em PDF de texto ou use CSV.",
    );
  }

  return { linhas, invalidas };
}
