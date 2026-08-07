/**
 * Agregação mensal para os insights — funções puras, sem banco e sem rede.
 *
 * LGPD: este módulo é a fronteira de minimização dos insights. O que sai daqui
 * já é agregado (total por categoria, total geral, variação). Transação
 * individual, valor bruto, saldo de conta, data e descrição NÃO passam por
 * aqui — e por isso não têm como chegar ao modelo.
 */

/** Linha crua vinda do banco. Só o necessário para agregar. */
export interface LinhaAgregacao {
  valor: number;
  tipo: "DEBITO" | "CREDITO";
  categoriaId: string | null;
}

export interface TotalCategoria {
  categoria: string;
  total: number;
  /** Variação percentual contra o mês anterior. `null` = não existia antes. */
  variacaoPct: number | null;
}

export interface AgregadoMensal {
  mes: string;
  mesAnterior: string;
  totalSaidas: number;
  totalSaidasAnterior: number;
  variacaoTotalPct: number | null;
  porCategoria: TotalCategoria[];
  /** Categorias que existiam no mês anterior e sumiram agora. */
  categoriasQueSumiram: string[];
}

const arredondar = (n: number) => Math.round(n * 100) / 100;

/** "2026-08" -> "2026-07" */
export function mesAnteriorDe(mes: string): string {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(ano, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Primeiro dia do mês e primeiro dia do mês seguinte, em ISO. */
export function intervaloDoMes(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split("-").map(Number) as [number, number];
  return {
    inicio: `${mes}-01`,
    fim: new Date(Date.UTC(ano, m, 1)).toISOString().slice(0, 10),
  };
}

/** Soma as saídas por categoria. Entradas ficam de fora: insight é sobre gasto. */
function somarSaidas(
  linhas: LinhaAgregacao[],
  nomePorId: Map<string, string>,
): { total: number; porCategoria: Map<string, number> } {
  let total = 0;
  const porCategoria = new Map<string, number>();

  for (const l of linhas) {
    if (l.tipo !== "DEBITO") continue;
    const valor = Math.abs(l.valor);
    total += valor;
    const nome = l.categoriaId
      ? (nomePorId.get(l.categoriaId) ?? "Não categorizado")
      : "Não categorizado";
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + valor);
  }

  return { total, porCategoria };
}

/** Variação percentual de `antes` para `agora`. `null` quando não havia base. */
export function variacao(agora: number, antes: number): number | null {
  if (antes <= 0) return null;
  return arredondar(((agora - antes) / antes) * 100);
}

export function agregarMes(
  mes: string,
  atual: LinhaAgregacao[],
  anterior: LinhaAgregacao[],
  nomePorId: Map<string, string>,
): AgregadoMensal {
  const a = somarSaidas(atual, nomePorId);
  const b = somarSaidas(anterior, nomePorId);

  const porCategoria: TotalCategoria[] = [...a.porCategoria.entries()]
    .map(([categoria, total]) => ({
      categoria,
      total: arredondar(total),
      variacaoPct: variacao(total, b.porCategoria.get(categoria) ?? 0),
    }))
    .sort((x, y) => y.total - x.total);

  const categoriasQueSumiram = [...b.porCategoria.keys()]
    .filter((c) => !a.porCategoria.has(c))
    .sort();

  return {
    mes,
    mesAnterior: mesAnteriorDe(mes),
    totalSaidas: arredondar(a.total),
    totalSaidasAnterior: arredondar(b.total),
    variacaoTotalPct: variacao(a.total, b.total),
    porCategoria,
    categoriasQueSumiram,
  };
}

/**
 * Prompt do apêndice C. O `user` é o JSON dos agregados — e nada além disso.
 * Se um dia alguém quiser mandar mais contexto, o teste de minimização quebra.
 */
export function montarPromptInsight(agregado: AgregadoMensal): {
  system: string;
  user: string;
} {
  const system = [
    "Você é um analista financeiro pessoal. Com base APENAS nos números agregados",
    "abaixo, escreva um resumo curto (2 a 4 frases) em português do Brasil,",
    "destacando as maiores variações e um ponto de atenção.",
    "Não invente dados além dos fornecidos. Não use markdown, listas nem títulos:",
    "apenas texto corrido. Valores em reais.",
  ].join("\n");

  return { system, user: JSON.stringify(agregado) };
}

/**
 * Impressão digital dos agregados. É o que invalida o cache: se os números
 * mudaram, o texto guardado está velho e precisa ser regerado — sem TTL
 * arbitrário e sem botão esquecido.
 */
export async function impressaoAgregado(agregado: AgregadoMensal): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(agregado));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
