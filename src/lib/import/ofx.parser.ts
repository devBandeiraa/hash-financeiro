/**
 * Parser OFX (Fase 6). Reaproveita a normalização do CSV.
 * Trata OFX SGML (tags não fechadas), que é o formato exportado pelos bancos.
 */
import { normalizarLinha } from "./normalize";
import type { LinhaInvalida, LinhaNormalizada } from "@/lib/types/dominio";

export interface ResultadoParseOfx {
  linhas: LinhaNormalizada[];
  invalidas: LinhaInvalida[];
}

function extrairTag(bloco: string, tag: string): string {
  const match = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return match ? match[1]!.trim() : "";
}

export function parseOfx(conteudo: string): ResultadoParseOfx {
  const texto = conteudo.replace(/\r\n?/g, "\n");
  const blocos = texto.split(/<STMTTRN>/i).slice(1);

  if (blocos.length === 0) {
    throw new Error("Nenhuma transação encontrada no arquivo OFX.");
  }

  const linhas: LinhaNormalizada[] = [];
  const invalidas: LinhaInvalida[] = [];

  blocos.forEach((bloco, indice) => {
    const corpo = bloco.split(/<\/STMTTRN>/i)[0] ?? bloco;
    const memo = extrairTag(corpo, "MEMO") || extrairTag(corpo, "NAME");
    const resultado = normalizarLinha({
      data: extrairTag(corpo, "DTPOSTED"),
      descricao: memo,
      valor: extrairTag(corpo, "TRNAMT"),
    });
    if (resultado.ok) linhas.push(resultado.linha);
    else invalidas.push({ linha: indice + 1, motivo: resultado.motivo });
  });

  return { linhas, invalidas };
}
