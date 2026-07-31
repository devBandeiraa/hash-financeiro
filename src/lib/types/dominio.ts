/**
 * Tipos de domínio compartilhados entre backend (server functions) e frontend.
 * Fase 0: apenas contratos. Nenhuma lógica aqui.
 */

export type TipoConta = "CORRENTE" | "POUPANCA" | "CARTAO";
export type TipoTransacao = "DEBITO" | "CREDITO";
export type OrigemImport = "CSV" | "OFX" | "MANUAL";

export interface Conta {
  id: string;
  nome: string;
  tipo: TipoConta;
}

export interface Categoria {
  id: string;
  nome: string;
  cor: string;
  /** null = categoria default do sistema */
  usuarioId: string | null;
}

export interface RegraCategorizacao {
  id: string;
  /** null = regra default do sistema */
  usuarioId: string | null;
  palavraChave: string;
  categoriaId: string;
  prioridade: number;
  ativa: boolean;
}

export interface Transacao {
  id: string;
  contaId: string;
  /** ISO date (YYYY-MM-DD) */
  data: string;
  descricao: string;
  /** Sempre positivo. O sinal está em `tipo`. */
  valor: number;
  tipo: TipoTransacao;
  categoriaId: string | null;
  origem: OrigemImport;
}

/** Linha já normalizada pelo parser, antes de virar Transacao no banco. */
export interface LinhaNormalizada {
  data: string;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
}

export interface LinhaInvalida {
  linha: number;
  motivo: string;
}

/** Resultado devolvido ao front após um import. Sem dado bruto do arquivo. */
export interface ResultadoImportacao {
  importadas: number;
  ignoradasDuplicadas: number;
  invalidas: LinhaInvalida[];
}

/** Prévia de um arquivo antes de confirmar o import. Sem dado bruto do arquivo. */
export interface PreviaImportacao {
  formato: OrigemImport;
  linhasLidas: number;
  aImportar: number;
  duplicadasNoArquivo: number;
  jaExistentes: number;
  semCategoria: number;
  invalidas: LinhaInvalida[];
  periodo: { de: string; ate: string } | null;
  totais: { entradas: number; saidas: number };
  porCategoria: { nome: string; cor: string; quantidade: number }[];
  amostra: {
    data: string;
    descricao: string;
    valor: number;
    tipo: TipoTransacao;
    categoria: string | null;
    situacao: "NOVA" | "DUPLICADA";
  }[];
}
