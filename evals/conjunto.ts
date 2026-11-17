/**
 * Eval da categorização: carrega o conjunto rotulado, as regras e categorias
 * do sistema (do Supabase local, já migrado) e mede a taxa de acerto.
 *
 * O conjunto em `categorizacao.csv` foi escrito sem consultar as regras do
 * seed. Ajustar regras para fazer este número subir invalida a medida.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { categorizar } from "../src/lib/categorize/engine";
import type { CategoriaOrigem, RegraCategorizacao } from "../src/lib/types/dominio";
import { clienteAdmin } from "../tests/integracao/supabase-local";

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Mesmo nome que o app usa para "sem categoria" (ver `sugerir.server.ts`). */
export const SEM_CATEGORIA = "Não categorizado";

export const CASOS = ["claro", "sem_ancora", "ambiguo", "abreviacao"] as const;
export type TipoCaso = (typeof CASOS)[number];

export interface ItemEval {
  id: string;
  descricao: string;
  tipo: "DEBITO" | "CREDITO";
  esperada: string;
  caso: TipoCaso;
  observacao: string;
}

export interface Dominio {
  categorias: string[];
  regras: RegraCategorizacao[];
  nomePorId: Map<string, string>;
}

export function carregarConjunto(categoriasValidas: string[]): ItemEval[] {
  const texto = readFileSync(join(AQUI, "categorizacao.csv"), "utf8").replace(
    new RegExp("^" + String.fromCharCode(0xfeff)),
    "",
  ); // remove BOM
  const [cabecalho, ...linhas] = texto.split(/\r?\n/).filter((l) => l.trim());
  if (cabecalho !== "id;descricao;tipo;categoria_esperada;caso;observacao") {
    throw new Error(`cabeçalho inesperado em categorizacao.csv: ${cabecalho}`);
  }

  const validas = new Set(categoriasValidas);
  const ids = new Set<string>();
  return linhas.map((linha, i) => {
    const campos = linha.split(";");
    if (campos.length !== 6)
      throw new Error(`linha ${i + 2}: esperava 6 campos, veio ${campos.length}`);
    const [id, descricao, tipo, esperada, caso, observacao] = campos as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (ids.has(id)) throw new Error(`linha ${i + 2}: id repetido ${id}`);
    ids.add(id);
    if (!validas.has(esperada))
      throw new Error(`linha ${i + 2}: categoria desconhecida "${esperada}"`);
    if (!(CASOS as readonly string[]).includes(caso)) {
      throw new Error(`linha ${i + 2}: caso desconhecido "${caso}"`);
    }
    if (tipo !== "DEBITO" && tipo !== "CREDITO") throw new Error(`linha ${i + 2}: tipo "${tipo}"`);
    return { id, descricao, tipo, esperada, caso: caso as TipoCaso, observacao };
  });
}

/** Regras e categorias do sistema (usuario_id NULL), como o banco migrado as tem. */
export async function carregarDominio(): Promise<Dominio> {
  const admin = clienteAdmin();
  const [cats, regras] = await Promise.all([
    admin.from("categorias").select("id, nome").is("usuario_id", null),
    admin
      .from("regras_categorizacao")
      .select("id, usuario_id, palavra_chave, categoria_id, prioridade, ativa, origem")
      .is("usuario_id", null),
  ]);
  if (cats.error || regras.error) {
    throw new Error("não carregou categorias/regras do Supabase local");
  }
  return {
    categorias: cats.data.map((c) => c.nome),
    nomePorId: new Map(cats.data.map((c) => [c.id, c.nome])),
    regras: regras.data.map((r) => ({
      id: r.id,
      usuarioId: r.usuario_id,
      palavraChave: r.palavra_chave,
      categoriaId: r.categoria_id,
      prioridade: r.prioridade,
      ativa: r.ativa,
      origem: r.origem as CategoriaOrigem,
    })),
  };
}

/** Saída do motor de regras, já como nome de categoria (null = sem match). */
export function preverPorRegras(itens: ItemEval[], dominio: Dominio): Map<string, string | null> {
  return new Map(
    itens.map((item) => {
      const id = categorizar(item.descricao, dominio.regras);
      return [item.id, id ? (dominio.nomePorId.get(id) ?? null) : null];
    }),
  );
}

export interface Resultado {
  modo: string;
  total: number;
  acertos: number;
  /** Itens em que o sistema propôs alguma categoria (≠ sem categoria). */
  categorizados: number;
  acertosCategorizados: number;
  porCaso: Record<TipoCaso, { total: number; acertos: number }>;
  erros: Array<{ item: ItemEval; prevista: string }>;
}

export function avaliar(
  modo: string,
  itens: ItemEval[],
  previstas: Map<string, string | null>,
): Resultado {
  const porCaso = Object.fromEntries(
    CASOS.map((c) => [c, { total: 0, acertos: 0 }]),
  ) as Resultado["porCaso"];
  const erros: Resultado["erros"] = [];
  let acertos = 0;
  let categorizados = 0;
  let acertosCategorizados = 0;

  for (const item of itens) {
    const prevista = previstas.get(item.id) ?? SEM_CATEGORIA;
    const certo = prevista === item.esperada;
    porCaso[item.caso].total += 1;
    if (certo) {
      acertos += 1;
      porCaso[item.caso].acertos += 1;
    } else {
      erros.push({ item, prevista });
    }
    if (prevista !== SEM_CATEGORIA) {
      categorizados += 1;
      if (certo) acertosCategorizados += 1;
    }
  }

  return {
    modo,
    total: itens.length,
    acertos,
    categorizados,
    acertosCategorizados,
    porCaso,
    erros,
  };
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");

/** Relatório em Markdown: vai para o terminal e para `evals/resultados/`. */
export function relatorio(r: Resultado, detalhes: { data: string; modelo: string }): string {
  const linhas = [
    `# Eval de categorização — ${r.modo}`,
    "",
    `- Data: ${detalhes.data}`,
    `- Modelo: ${detalhes.modelo}`,
    `- Conjunto: ${r.total} descrições sintéticas (evals/categorizacao.csv)`,
    "",
    "| Medida | Valor |",
    "| --- | --- |",
    `| Acerto geral | ${pct(r.acertos, r.total)} (${r.acertos}/${r.total}) |`,
    `| Cobertura (propôs alguma categoria) | ${pct(r.categorizados, r.total)} (${r.categorizados}/${r.total}) |`,
    `| Acerto quando propõe | ${pct(r.acertosCategorizados, r.categorizados)} (${r.acertosCategorizados}/${r.categorizados}) |`,
    "",
    "| Caso | Acerto |",
    "| --- | --- |",
    ...CASOS.map(
      (c) =>
        `| ${c} | ${pct(r.porCaso[c].acertos, r.porCaso[c].total)} (${r.porCaso[c].acertos}/${r.porCaso[c].total}) |`,
    ),
    "",
    `## Erros (${r.erros.length})`,
    "",
    "| id | descrição | esperada | prevista | caso |",
    "| --- | --- | --- | --- | --- |",
    ...r.erros.map(
      ({ item, prevista }) =>
        `| ${item.id} | \`${item.descricao}\` | ${item.esperada} | ${prevista} | ${item.caso} |`,
    ),
    "",
  ];
  return linhas.join("\n");
}

export function gravarRelatorio(nomeArquivo: string, conteudo: string): string {
  const pasta = join(AQUI, "resultados");
  mkdirSync(pasta, { recursive: true });
  const caminho = join(pasta, nomeArquivo);
  writeFileSync(caminho, conteudo, "utf8");
  return caminho;
}

export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}
