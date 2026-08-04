/**
 * Normalização de uma linha de extrato para o formato canônico do domínio.
 * Reaproveitado por CSV (Fase 3) e PDF (Fase 6). Funções puras e testáveis.
 */
import type { LinhaNormalizada, TipoTransacao } from "@/lib/types/dominio";

/** "31/07/2026", "2026-07-31", "31-07-2026" -> "2026-07-31" */
export function normalizarData(bruto: string): string | null {
  const texto = bruto.trim();
  if (!texto) return null;

  const iso = texto.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (iso) return validarData(`${iso[1]!}-${iso[2]!}-${iso[3]!}`);

  const br = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (br) {
    const dia = br[1]!.padStart(2, "0");
    const mes = br[2]!.padStart(2, "0");
    const ano = br[3]!.length === 2 ? `20${br[3]!}` : br[3]!;
    return validarData(`${ano}-${mes}-${dia}`);
  }

  // Compacto: 20260731 ou 20260731120000
  const compacta = texto.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compacta) return validarData(`${compacta[1]!}-${compacta[2]!}-${compacta[3]!}`);

  return null;
}

function validarData(iso: string): string | null {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** "1.234,56" | "-1234.56" | "R$ 1.234,56" -> { valor: 1234.56, tipo } */
export function normalizarValor(bruto: string): { valor: number; tipo: TipoTransacao } | null {
  let texto = bruto.trim().replace(/\s|R\$/gi, "");
  if (!texto) return null;

  let negativo = texto.startsWith("-");
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1);
  }
  texto = texto.replace(/^[+-]/, "");

  const temVirgula = texto.includes(",");
  const temPonto = texto.includes(".");
  if (temVirgula && temPonto) {
    // o último separador é o decimal
    texto =
      texto.lastIndexOf(",") > texto.lastIndexOf(".")
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto.replace(/,/g, "");
  } else if (temVirgula) {
    texto = texto.replace(",", ".");
  } else if (temPonto && /\.\d{3}$/.test(texto)) {
    // 1.234 -> milhar, não decimal
    texto = texto.replace(/\./g, "");
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero)) return null;

  return {
    valor: Math.round(Math.abs(numero) * 100) / 100,
    tipo: negativo ? "DEBITO" : "CREDITO",
  };
}

/** Maiúsculas, sem acento, sem ruído — base para regras e para o hash. */
export function normalizarDescricao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface LinhaBruta {
  data: string;
  descricao: string;
  valor: string;
  /** opcional: coluna de tipo/DC do banco */
  tipo?: string | undefined;
}

export type ResultadoLinha = { ok: true; linha: LinhaNormalizada } | { ok: false; motivo: string };

export function normalizarLinha(bruta: LinhaBruta): ResultadoLinha {
  const data = normalizarData(bruta.data ?? "");
  if (!data) return { ok: false, motivo: "data inválida" };

  const descricao = (bruta.descricao ?? "").trim();
  if (!descricao) return { ok: false, motivo: "descrição vazia" };

  const valor = normalizarValor(bruta.valor ?? "");
  if (!valor) return { ok: false, motivo: "valor inválido" };
  if (valor.valor === 0) return { ok: false, motivo: "valor zerado" };

  let tipo = valor.tipo;
  const dica = (bruta.tipo ?? "").trim().toUpperCase();
  if (dica) {
    if (/^(D|DEB|DEBITO|DÉBITO|SAIDA|SAÍDA)$/.test(dica)) tipo = "DEBITO";
    if (/^(C|CRED|CREDITO|CRÉDITO|ENTRADA)$/.test(dica)) tipo = "CREDITO";
  }

  return { ok: true, linha: { data, descricao, valor: valor.valor, tipo } };
}
