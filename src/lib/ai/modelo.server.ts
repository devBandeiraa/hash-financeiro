/**
 * Camada de modelo de linguagem — só roda no servidor.
 *
 * Aqui mora o que não depende de provedor: timeout, retry, parse seguro de
 * JSON e a política de erro. Cada provedor vive em `provedores/` e implementa
 * uma interface de um método só.
 *
 * SEGURANÇA: este módulo lê chaves de API de `process.env`. Arquivos de rota e
 * `*.functions.ts` vão para o bundle do navegador, então nunca importe daqui
 * no topo desses arquivos — use `await import(...)` dentro do handler, como já
 * se faz com `client.server.ts`.
 *
 * LGPD: nada de payload em log. Erros são descritos por rótulo e status HTTP,
 * jamais pelo conteúdo enviado ou recebido.
 */
import type * as z from "zod/v4";

/** Falha da camada de IA. O chamador degrada para o determinístico. */
export class IaIndisponivelError extends Error {
  constructor(readonly motivo: string) {
    super(`IA indisponível: ${motivo}`);
    this.name = "IaIndisponivelError";
  }
}

/**
 * Erro já normalizado por um provedor. Existe para o retry decidir sem
 * conhecer os tipos de erro de cada SDK.
 */
export class ErroProvedor extends Error {
  constructor(
    readonly rotulo: string,
    readonly ehTransitorio: boolean,
  ) {
    super(rotulo);
    this.name = "ErroProvedor";
  }
}

export interface PedidoModelo {
  system: string;
  user: string;
  /** Teto de tokens da resposta, incluindo o raciocínio do modelo. */
  maxTokens?: number;
  /** `baixo` desliga/minimiza o raciocínio — resolve tarefas estruturadas. */
  esforco?: "baixo" | "normal";
  /**
   * Schema zod da resposta esperada. Cada provedor traduz para o seu formato
   * de saída estruturada. Manter zod aqui é o que deixa a troca de provedor
   * ser um arquivo, e não uma refatoração.
   */
  esquema?: z.ZodType;
}

/** Contrato do modelo. Enxuto de proposito: trocar provedor e barato. */
export interface ClienteModelo {
  gerar(pedido: PedidoModelo, signal: AbortSignal): Promise<string>;
  /**
   * Conversa com histórico e ferramentas, emitindo em streaming.
   * Opcional: um provedor sem isso continua servindo a Parte A inteira.
   */
  conversar?(pedido: PedidoConversa, signal: AbortSignal): AsyncIterable<EventoModelo>;
}

export interface OpcoesChamada {
  cliente?: ClienteModelo;
  /** Deadline de cada tentativa. Padrão 30s. */
  timeoutMs?: number;
  /** Total de tentativas, incluindo a primeira. Padrão 3. */
  tentativas?: number;
  /** Espera base entre tentativas, dobrada a cada falha. Padrão 500ms. */
  esperaBaseMs?: number;
  /** Injetável para não deixar o teste dormindo de verdade. */
  dormir?: (ms: number) => Promise<void>;
}

export type Provedor = "gemini" | "anthropic";

/**
 * Qual provedor usar. Explícito em `IA_PROVEDOR` vence; senão, o primeiro que
 * tiver chave configurada.
 */
export function provedorAtivo(): Provedor | null {
  const escolhido = process.env["IA_PROVEDOR"]?.trim().toLowerCase();
  if (escolhido === "gemini" || escolhido === "anthropic") return escolhido;
  if (process.env["GEMINI_API_KEY"]?.trim()) return "gemini";
  if (process.env["ANTHROPIC_API_KEY"]?.trim()) return "anthropic";
  return null;
}

/** `true` se a IA está configurada — para o front esconder o que não funciona. */
export function iaConfigurada(): boolean {
  return provedorAtivo() !== null;
}

let clienteMemo: ClienteModelo | undefined;

/** Cliente do provedor ativo, memoizado. */
export async function clientePadrao(): Promise<ClienteModelo> {
  if (clienteMemo) return clienteMemo;

  const provedor = provedorAtivo();
  if (!provedor) {
    throw new IaIndisponivelError("nenhuma chave de IA configurada (GEMINI_API_KEY)");
  }

  clienteMemo =
    provedor === "gemini"
      ? (await import("./provedores/gemini.server")).criarClienteGemini()
      : (await import("./provedores/anthropic.server")).criarClienteAnthropic();

  return clienteMemo;
}

/** Só para teste: descarta o cliente memoizado. */
export function resetarCliente(): void {
  clienteMemo = undefined;
}

const dormirDeVerdade = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Descrição de erro segura para log: rótulo e status, nunca conteúdo.
 * Mensagens de API podem ecoar o payload — por isso não entram aqui.
 */
function descreverErro(erro: unknown): string {
  if (erro instanceof ErroProvedor) return erro.rotulo;
  if (erro instanceof Error) return erro.name;
  return "erro desconhecido";
}

/** Vale a pena tentar de novo? Erro de validação (4xx) não vale. */
function transitorio(erro: unknown): boolean {
  if (erro instanceof ErroProvedor) return erro.ehTransitorio;
  // AbortError do nosso próprio timeout, ou falha de rede crua.
  return erro instanceof Error && (erro.name === "AbortError" || erro.name === "TimeoutError");
}

/**
 * Chama o modelo com timeout por tentativa e retry exponencial em falha
 * transitória. Sempre lança `IaIndisponivelError` — o chamador não precisa
 * conhecer os tipos de erro do provedor para degradar.
 */
export async function chamarModelo(
  pedido: PedidoModelo,
  opcoes: OpcoesChamada = {},
): Promise<string> {
  const cliente = opcoes.cliente ?? (await clientePadrao());
  const timeoutMs = opcoes.timeoutMs ?? 30_000;
  const tentativas = Math.max(1, opcoes.tentativas ?? 3);
  const esperaBaseMs = opcoes.esperaBaseMs ?? 500;
  const dormir = opcoes.dormir ?? dormirDeVerdade;

  let ultimo = "sem tentativas";

  for (let i = 0; i < tentativas; i += 1) {
    try {
      const texto = (await cliente.gerar(pedido, AbortSignal.timeout(timeoutMs))) ?? "";
      const limpo = texto.trim();
      if (!limpo) throw new IaIndisponivelError("resposta vazia");
      return limpo;
    } catch (erro) {
      if (erro instanceof IaIndisponivelError) throw erro;

      ultimo = descreverErro(erro);
      const ultimaTentativa = i === tentativas - 1;
      if (ultimaTentativa || !transitorio(erro)) break;

      console.warn(`[ia] tentativa ${i + 1}/${tentativas} falhou: ${ultimo}`);
      await dormir(esperaBaseMs * 2 ** i);
    }
  }

  throw new IaIndisponivelError(ultimo);
}

/**
 * Parse de JSON tolerante ao que modelos costumam devolver: cerca de markdown,
 * texto antes/depois do objeto. Formato inválido devolve `null` — nunca lança,
 * porque o fallback determinístico é que decide o que fazer.
 */
export function parseJsonSeguro<T = unknown>(texto: string): T | null {
  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidatos = [limpo, recortarPrimeiroJson(limpo)].filter((c): c is string => Boolean(c));

  for (const candidato of candidatos) {
    try {
      return JSON.parse(candidato) as T;
    } catch {
      // tenta o próximo recorte
    }
  }
  return null;
}

/** Recorta do primeiro `{`/`[` até o fechamento correspondente. */
function recortarPrimeiroJson(texto: string): string | null {
  const inicio = texto.search(/[[{]/);
  if (inicio === -1) return null;

  const abre = texto[inicio] === "[" ? "[" : "{";
  const fecha = abre === "[" ? "]" : "}";

  let nivel = 0;
  let dentroDeString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];

    if (escapado) {
      escapado = false;
      continue;
    }
    if (c === "\\") {
      escapado = true;
      continue;
    }
    if (c === '"') {
      dentroDeString = !dentroDeString;
      continue;
    }
    if (dentroDeString) continue;

    if (c === abre) nivel += 1;
    else if (c === fecha) {
      nivel -= 1;
      if (nivel === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

// --------------------------------------------------------------- conversa ---

/** Pedido do modelo para executar uma ferramenta. */
export interface ChamadaFerramenta {
  id: string;
  nome: string;
  args: Record<string, unknown>;
  /**
   * Dado opaco do provedor que precisa voltar intacto no histórico. O Gemini
   * 3.x recusa (400) um `functionCall` reenviado sem a `thoughtSignature` que
   * ele emitiu junto. O loop não interpreta isto — só carrega.
   *
   * `| undefined` explícito por causa de `exactOptionalPropertyTypes`: o
   * histórico chega do cliente validado por zod, que produz essa forma.
   */
  assinatura?: string | undefined;
}

/** Um turno do histórico. É o que o provedor traduz para o formato dele. */
export type TurnoConversa =
  | { papel: "usuario"; texto: string }
  | { papel: "modelo"; texto: string; chamadas: ChamadaFerramenta[] }
  | { papel: "ferramenta"; respostas: Array<{ id: string; nome: string; conteudo: string }> };

/** Ferramenta oferecida ao modelo, ainda sem forma de provedor. */
export interface DeclaracaoFerramenta {
  nome: string;
  descricao: string;
  esquema: z.ZodObject<z.ZodRawShape>;
}

export interface PedidoConversa {
  system: string;
  historico: TurnoConversa[];
  ferramentas: DeclaracaoFerramenta[];
  maxTokens?: number;
}

/** O que o provedor emite enquanto gera. Texto chega em pedaços. */
export type EventoModelo =
  { tipo: "texto"; conteudo: string } | { tipo: "chamadas"; chamadas: ChamadaFerramenta[] };
