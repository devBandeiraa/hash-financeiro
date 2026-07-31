/**
 * Leitura de CSV: detecção de separador, mapeamento de colunas e parsing.
 * Serviço puro e testável — não acessa banco nem sessão.
 */
import { normalizarLinha, type ResultadoLinha } from "./normalize";
import type { LinhaInvalida, LinhaNormalizada } from "@/lib/types/dominio";

export type Separador = ";" | "," | "\t";

export function detectarSeparador(cabecalho: string): Separador {
  const candidatos: Separador[] = [";", ",", "\t"];
  let melhor: Separador = ",";
  let max = -1;
  for (const c of candidatos) {
    const n = cabecalho.split(c).length;
    if (n > max) {
      max = n;
      melhor = c;
    }
  }
  return melhor;
}

/** Parser de linha CSV com suporte a aspas duplas e escape "". */
export function parseLinhaCsv(linha: string, sep: Separador): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i]!;
    if (dentroAspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else dentroAspas = false;
      } else atual += ch;
    } else if (ch === '"') {
      dentroAspas = true;
    } else if (ch === sep) {
      campos.push(atual);
      atual = "";
    } else {
      atual += ch;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

const SINONIMOS = {
  data: ["data", "date", "dt", "data lancamento", "data movimento", "dtposted"],
  descricao: [
    "descricao",
    "descrição",
    "historico",
    "histórico",
    "lancamento",
    "lançamento",
    "memo",
    "detalhes",
    "description",
  ],
  valor: ["valor", "amount", "montante", "quantia", "vlr", "trnamt"],
  tipo: ["tipo", "d/c", "dc", "natureza", "trntype"],
} as const;

export interface MapaColunas {
  data: number;
  descricao: number;
  valor: number;
  tipo: number | null;
}

function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapearColunas(cabecalho: string[]): MapaColunas | null {
  const normalizado = cabecalho.map(chave);
  const achar = (lista: readonly string[]) =>
    normalizado.findIndex((c) => lista.some((s) => c === chave(s) || c.includes(chave(s))));

  const data = achar(SINONIMOS.data);
  const descricao = achar(SINONIMOS.descricao);
  const valor = achar(SINONIMOS.valor);
  const tipo = achar(SINONIMOS.tipo);

  if (data < 0 || descricao < 0 || valor < 0) return null;
  return { data, descricao, valor, tipo: tipo < 0 ? null : tipo };
}

export interface ResultadoParseCsv {
  linhas: LinhaNormalizada[];
  invalidas: LinhaInvalida[];
}

export function parseCsv(conteudo: string): ResultadoParseCsv {
  const texto = conteudo.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const brutas = texto.split("\n").filter((l) => l.trim().length > 0);
  if (brutas.length === 0) throw new Error("Arquivo vazio.");

  const sep = detectarSeparador(brutas[0]!);
  const cabecalho = parseLinhaCsv(brutas[0]!, sep);
  const mapa = mapearColunas(cabecalho);
  if (!mapa) {
    throw new Error(
      "Não encontrei as colunas de data, descrição e valor no cabeçalho do arquivo.",
    );
  }

  const linhas: LinhaNormalizada[] = [];
  const invalidas: LinhaInvalida[] = [];

  for (let i = 1; i < brutas.length; i++) {
    const campos = parseLinhaCsv(brutas[i]!, sep);
    const resultado: ResultadoLinha = normalizarLinha({
      data: campos[mapa.data] ?? "",
      descricao: campos[mapa.descricao] ?? "",
      valor: campos[mapa.valor] ?? "",
      tipo: mapa.tipo === null ? undefined : campos[mapa.tipo],
    });
    // Nunca registramos o conteúdo da linha — só o número e o motivo (LGPD).
    if (resultado.ok) linhas.push(resultado.linha);
    else invalidas.push({ linha: i + 1, motivo: resultado.motivo });
  }

  return { linhas, invalidas };
}
