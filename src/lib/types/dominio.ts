/**
 * Tipos de domínio compartilhados entre backend (server functions) e frontend.
 * Fase 0: apenas contratos. Nenhuma lógica aqui.
 */
import type { AgregadoMensal } from "@/lib/insights/agregar";

export type { AgregadoMensal, TotalCategoria } from "@/lib/insights/agregar";

export type TipoConta = "CORRENTE" | "POUPANCA" | "CARTAO";
export type TipoTransacao = "DEBITO" | "CREDITO";
export type OrigemImport = "CSV" | "PDF" | "MANUAL";

/**
 * Quem definiu a categoria de um lançamento (ou criou uma regra).
 * `sistema` = motor determinístico, `usuario` = correção manual,
 * `ia` = sugestão do modelo de linguagem confirmada pelo usuário.
 */
export type CategoriaOrigem = "sistema" | "usuario" | "ia";

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
  origem: CategoriaOrigem;
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
  categoriaOrigem: CategoriaOrigem;
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

/**
 * Uma sugestão de IA ainda NÃO aplicada. É a unidade do dry-run: o usuário vê
 * isso e decide. Nada aqui tocou o banco.
 */
export interface SugestaoIa {
  descricao: string;
  categoriaId: string;
  categoriaNome: string;
  categoriaCor: string;
  /** Quantos lançamentos sem categoria têm exatamente esta descrição. */
  quantidade: number;
  /**
   * Palavra-chave que viraria regra se o usuário aceitar. `null` quando a
   * descrição não tem âncora confiável — aí a categoria é aplicada, mas
   * nenhuma regra é criada.
   */
  palavraChave: string | null;
  /** Já existe regra do usuário com essa palavra-chave? Então será atualizada. */
  regraExistente: boolean;
}

/** Prévia (dry-run) da categorização por IA. Nada foi gravado. */
export interface PreviaSugestoesIa {
  /** Lançamentos sem categoria que o motor determinístico não pegou. */
  totalSemCategoria: number;
  /** Descrições distintas enviadas ao modelo. */
  descricoesConsultadas: number;
  sugestoes: SugestaoIa[];
  /** `false` quando não há chave de IA configurada ou o provedor está fora. */
  iaDisponivel: boolean;
}

/** Resultado de aplicar as sugestões confirmadas pelo usuário. */
export interface ResultadoSugestoesIa {
  transacoesAtualizadas: number;
  regrasCriadas: number;
  regrasAtualizadas: number;
}

/**
 * Insight mensal: o texto da IA mais os números que o embasam. O front mostra
 * os dois juntos — resumo sem os números por trás é pedir para confiar no
 * modelo, e não é isso que este projeto propõe.
 */
export interface InsightMensal {
  /** `null` quando a IA não está disponível: os agregados continuam válidos. */
  texto: string | null;
  agregado: AgregadoMensal;
  /** `true` se veio do cache, sem chamar o modelo. */
  doCache: boolean;
  geradoEm: string | null;
  iaDisponivel: boolean;
}
