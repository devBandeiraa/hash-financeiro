/**
 * Server functions do Hash Financeiro. Toda leitura/escrita passa por
 * `requireSupabaseAuth`: o cliente age como o usuário logado e o RLS do banco
 * garante o isolamento. Nenhum dado financeiro é logado.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseCsv } from "@/lib/import/csv.parser";
import { parsePdfTexto } from "@/lib/import/pdf.parser";
import { calcularHashDedupe } from "@/lib/import/dedupe";
import { categorizar } from "@/lib/categorize/engine";
import { extrairPalavraChave } from "@/lib/categorize/ai/palavra-chave";
import { aplicarSugestoes } from "@/lib/categorize/ai/aplicar";
import {
  agregarMes,
  impressaoAgregado,
  intervaloDoMes,
  mesAnteriorDe,
  type LinhaAgregacao,
} from "@/lib/insights/agregar";
import type {
  Categoria,
  CategoriaOrigem,
  Conta,
  InsightMensal,
  PreviaImportacao,
  PreviaSugestoesIa,
  RegraCategorizacao,
  ResultadoImportacao,
  ResultadoSugestoesIa,
  SugestaoIa,
  TipoConta,
  TipoTransacao,
  Transacao,
} from "@/lib/types/dominio";

const LIMITE_LINHAS = 5000;

/** Teto de lançamentos sem categoria examinados por rodada de IA. */
const LIMITE_SEM_CATEGORIA = 2000;

/** Teto de descrições distintas mandadas ao modelo — segura custo e cota. */
const LIMITE_DESCRICOES_IA = 100;

/**
 * Prioridade das regras nascidas de IA. Maior que o padrão manual (10), então
 * uma regra que o usuário escreveu à mão sempre vence a que a IA propôs.
 */
const PRIORIDADE_REGRA_IA = 200;

export const listarContas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Conta[]> => {
    const { data, error } = await context.supabase
      .from("contas")
      .select("id, nome, tipo")
      .order("criado_em", { ascending: true });
    if (error) throw new Error("Não foi possível carregar as contas.");
    return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo as TipoConta }));
  });

export const criarConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nome: z.string().trim().min(1).max(60),
        tipo: z.enum(["CORRENTE", "POUPANCA", "CARTAO"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Conta> => {
    const { data: criada, error } = await context.supabase
      .from("contas")
      .insert({ nome: data.nome, tipo: data.tipo, usuario_id: context.userId })
      .select("id, nome, tipo")
      .single();
    if (error || !criada) throw new Error("Não foi possível criar a conta.");
    return { id: criada.id, nome: criada.nome, tipo: criada.tipo as TipoConta };
  });

export const listarCategorias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Categoria[]> => {
    const { data, error } = await context.supabase
      .from("categorias")
      .select("id, nome, cor, usuario_id")
      .order("nome", { ascending: true });
    if (error) throw new Error("Não foi possível carregar as categorias.");
    return (data ?? []).map((c) => ({
      id: c.id,
      nome: c.nome,
      cor: c.cor,
      usuarioId: c.usuario_id,
    }));
  });

async function buscarRegras(supabase: {
  from: (t: "regras_categorizacao") => any;
}): Promise<RegraCategorizacao[]> {
  const { data, error } = await supabase
    .from("regras_categorizacao")
    .select("id, usuario_id, palavra_chave, categoria_id, prioridade, ativa, origem");
  if (error) throw new Error("Não foi possível carregar as regras.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r["id"] as string,
    usuarioId: (r["usuario_id"] as string | null) ?? null,
    palavraChave: r["palavra_chave"] as string,
    categoriaId: r["categoria_id"] as string,
    prioridade: r["prioridade"] as number,
    ativa: r["ativa"] as boolean,
    origem: r["origem"] as CategoriaOrigem,
  }));
}

export const listarRegras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RegraCategorizacao[]> =>
    buscarRegras(context.supabase as never),
  );

export const criarRegra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        palavraChave: z.string().trim().min(2).max(60),
        categoriaId: z.string().uuid(),
        prioridade: z.number().int().min(1).max(1000).default(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("regras_categorizacao").insert({
      usuario_id: context.userId,
      palavra_chave: data.palavraChave,
      categoria_id: data.categoriaId,
      prioridade: data.prioridade,
    });
    if (error) throw new Error("Não foi possível criar a regra.");
    return { ok: true };
  });

export const excluirRegra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("regras_categorizacao")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir a regra.");
    return { ok: true };
  });

export const importarExtrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contaId: z.string().uuid(),
        conteudo: z.string().min(1).max(4_000_000),
        formato: z.enum(["CSV", "PDF"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ResultadoImportacao> => {
    const { supabase, userId } = context;

    const { data: conta } = await supabase
      .from("contas")
      .select("id")
      .eq("id", data.contaId)
      .maybeSingle();
    if (!conta) throw new Error("Conta não encontrada.");

    const { linhas, invalidas } =
      data.formato === "PDF" ? parsePdfTexto(data.conteudo) : parseCsv(data.conteudo);

    if (linhas.length > LIMITE_LINHAS) {
      throw new Error(
        `Arquivo grande demais: máximo de ${LIMITE_LINHAS} lançamentos por importação.`,
      );
    }

    const regras = await buscarRegras(supabase as never);

    const registros = await Promise.all(
      linhas.map(async (linha) => ({
        usuario_id: userId,
        conta_id: data.contaId,
        data: linha.data,
        descricao: linha.descricao,
        valor: linha.valor,
        tipo: linha.tipo,
        categoria_id: categorizar(linha.descricao, regras),
        origem: data.formato,
        hash_dedupe: await calcularHashDedupe({
          usuarioId: userId,
          contaId: data.contaId,
          data: linha.data,
          valor: linha.valor,
          tipo: linha.tipo,
          descricao: linha.descricao,
        }),
      })),
    );

    // dedupe dentro do próprio arquivo
    const vistos = new Set<string>();
    const unicos = registros.filter((r) => {
      if (vistos.has(r.hash_dedupe)) return false;
      vistos.add(r.hash_dedupe);
      return true;
    });
    let duplicadas = registros.length - unicos.length;

    let importadas = 0;
    const lote = 200;
    for (let i = 0; i < unicos.length; i += lote) {
      const fatia = unicos.slice(i, i + lote);
      const { data: inseridas, error } = await supabase
        .from("transacoes")
        .upsert(fatia, { onConflict: "usuario_id,hash_dedupe", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error("Falha ao gravar as transações importadas.");
      const n = inseridas?.length ?? 0;
      importadas += n;
      duplicadas += fatia.length - n;
    }

    return { importadas, ignoradasDuplicadas: duplicadas, invalidas };
  });

export const listarTransacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mes: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        categoriaId: z.string().uuid().nullable().optional(),
        busca: z.string().trim().max(60).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<Transacao[]> => {
    let query = context.supabase
      .from("transacoes")
      .select("id, conta_id, data, descricao, valor, tipo, categoria_id, categoria_origem, origem")
      .order("data", { ascending: false })
      .limit(500);

    if (data.mes) {
      const inicio = `${data.mes}-01`;
      const [ano, mes] = data.mes.split("-").map(Number) as [number, number];
      const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
      query = query.gte("data", inicio).lt("data", fim);
    }
    if (data.categoriaId) query = query.eq("categoria_id", data.categoriaId);
    if (data.busca) query = query.ilike("descricao", `%${data.busca}%`);

    const { data: linhas, error } = await query;
    if (error) throw new Error("Não foi possível carregar as transações.");

    return (linhas ?? []).map((t) => ({
      id: t.id,
      contaId: t.conta_id,
      data: t.data,
      descricao: t.descricao,
      valor: Number(t.valor),
      tipo: t.tipo as TipoTransacao,
      categoriaId: t.categoria_id,
      categoriaOrigem: t.categoria_origem,
      origem: t.origem,
    }));
  });

export const atualizarCategoriaTransacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), categoriaId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Correção manual: a origem passa a `usuario` e não volta atrás sozinha.
    const { error } = await context.supabase
      .from("transacoes")
      .update({ categoria_id: data.categoriaId, categoria_origem: "usuario" })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível atualizar a categoria.");
    return { ok: true };
  });

export const reclassificarTudo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const regras = await buscarRegras(context.supabase as never);
    const { data: transacoes, error } = await context.supabase
      .from("transacoes")
      .select("id, descricao, categoria_id")
      .is("categoria_id", null)
      .limit(2000);
    if (error) throw new Error("Não foi possível reclassificar.");

    let atualizadas = 0;
    for (const t of transacoes ?? []) {
      const categoriaId = categorizar(t.descricao, regras);
      if (!categoriaId) continue;
      const { error: erroUpdate } = await context.supabase
        .from("transacoes")
        .update({ categoria_id: categoriaId, categoria_origem: "sistema" })
        .eq("id", t.id);
      if (!erroUpdate) atualizadas += 1;
    }
    return { atualizadas };
  });

export interface ResumoDashboard {
  mes: string;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  porCategoria: Array<{ categoriaId: string | null; nome: string; cor: string; total: number }>;
  serieDiaria: Array<{ data: string; saidas: number }>;
  naoCategorizadas: number;
  totalTransacoes: number;
}

export const resumoDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ResumoDashboard> => {
    const inicio = `${data.mes}-01`;
    const [ano, mes] = data.mes.split("-").map(Number) as [number, number];
    const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

    const [{ data: transacoes, error }, { data: categorias }] = await Promise.all([
      context.supabase
        .from("transacoes")
        .select("data, valor, tipo, categoria_id")
        .gte("data", inicio)
        .lt("data", fim),
      context.supabase.from("categorias").select("id, nome, cor"),
    ]);
    if (error) throw new Error("Não foi possível carregar o resumo.");

    const mapaCategorias = new Map(
      (categorias ?? []).map((c) => [c.id, { nome: c.nome, cor: c.cor }]),
    );

    let totalEntradas = 0;
    let totalSaidas = 0;
    let naoCategorizadas = 0;
    const porCategoria = new Map<string | null, number>();
    const serie = new Map<string, number>();

    for (const t of transacoes ?? []) {
      const valor = Number(t.valor);
      if (t.tipo === "CREDITO") {
        totalEntradas += valor;
        continue;
      }
      totalSaidas += valor;
      if (!t.categoria_id) naoCategorizadas += 1;
      porCategoria.set(t.categoria_id, (porCategoria.get(t.categoria_id) ?? 0) + valor);
      serie.set(t.data, (serie.get(t.data) ?? 0) + valor);
    }

    const arredondar = (n: number) => Math.round(n * 100) / 100;

    return {
      mes: data.mes,
      totalEntradas: arredondar(totalEntradas),
      totalSaidas: arredondar(totalSaidas),
      saldo: arredondar(totalEntradas - totalSaidas),
      porCategoria: [...porCategoria.entries()]
        .map(([categoriaId, total]) => ({
          categoriaId,
          nome: categoriaId ? (mapaCategorias.get(categoriaId)?.nome ?? "—") : "Não categorizado",
          cor: categoriaId ? (mapaCategorias.get(categoriaId)?.cor ?? "#94a3b8") : "#94a3b8",
          total: arredondar(total),
        }))
        .sort((a, b) => b.total - a.total),
      serieDiaria: [...serie.entries()]
        .map(([dia, saidas]) => ({ data: dia, saidas: arredondar(saidas) }))
        .sort((a, b) => a.data.localeCompare(b.data)),
      naoCategorizadas,
      totalTransacoes: transacoes?.length ?? 0,
    };
  });

/**
 * Direito ao esquecimento (LGPD): apaga transações, contas e regras do usuário
 * e remove a própria conta de acesso. Só o dono pode executar sobre si mesmo.
 */
export const excluirMinhaConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    await supabase.from("insights_mensais").delete().eq("usuario_id", userId);
    await supabase.from("transacoes").delete().eq("usuario_id", userId);
    await supabase.from("regras_categorizacao").delete().eq("usuario_id", userId);
    await supabase.from("categorias").delete().eq("usuario_id", userId);
    await supabase.from("contas").delete().eq("usuario_id", userId);
    await supabase.from("perfis").delete().eq("id", userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error("Dados apagados, mas a conta de acesso não pôde ser removida.");

    return { ok: true };
  });

/**
 * Prévia (dry-run) do arquivo: faz o mesmo parsing, hash e categorização do
 * import real, mas não grava nada. Devolve só agregados e uma amostra curta.
 */
export const analisarExtrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contaId: z.string().uuid(),
        conteudo: z.string().min(1).max(4_000_000),
        formato: z.enum(["CSV", "PDF"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<PreviaImportacao> => {
    const { supabase, userId } = context;

    const { data: conta } = await supabase
      .from("contas")
      .select("id")
      .eq("id", data.contaId)
      .maybeSingle();
    if (!conta) throw new Error("Conta não encontrada.");

    const { linhas, invalidas } =
      data.formato === "PDF" ? parsePdfTexto(data.conteudo) : parseCsv(data.conteudo);

    if (linhas.length > LIMITE_LINHAS) {
      throw new Error(
        `Arquivo grande demais: máximo de ${LIMITE_LINHAS} lançamentos por importação.`,
      );
    }

    const [regras, { data: cats }] = await Promise.all([
      buscarRegras(supabase as never),
      supabase.from("categorias").select("id, nome, cor"),
    ]);
    const porId = new Map(
      ((cats ?? []) as Array<{ id: string; nome: string; cor: string }>).map((c) => [c.id, c]),
    );

    const itens = await Promise.all(
      linhas.map(async (linha) => ({
        ...linha,
        categoriaId: categorizar(linha.descricao, regras),
        hash: await calcularHashDedupe({
          usuarioId: userId,
          contaId: data.contaId,
          data: linha.data,
          valor: linha.valor,
          tipo: linha.tipo,
          descricao: linha.descricao,
        }),
      })),
    );

    // duplicadas dentro do próprio arquivo
    const vistos = new Set<string>();
    const unicos = itens.filter((i) => {
      if (vistos.has(i.hash)) return false;
      vistos.add(i.hash);
      return true;
    });
    const duplicadasNoArquivo = itens.length - unicos.length;

    // duplicadas contra o que já está no banco
    const existentes = new Set<string>();
    const hashes = unicos.map((i) => i.hash);
    for (let i = 0; i < hashes.length; i += 200) {
      const { data: achadas } = await supabase
        .from("transacoes")
        .select("hash_dedupe")
        .in("hash_dedupe", hashes.slice(i, i + 200));
      for (const t of (achadas ?? []) as Array<{ hash_dedupe: string }>) {
        existentes.add(t.hash_dedupe);
      }
    }

    const novos = unicos.filter((i) => !existentes.has(i.hash));

    const datas = novos.map((i) => i.data).sort();
    const contagem = new Map<string, number>();
    let entradas = 0;
    let saidas = 0;
    for (const i of novos) {
      if (i.tipo === "CREDITO") entradas += i.valor;
      else saidas += i.valor;
      const chave = i.categoriaId ?? "";
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }

    const porCategoria = [...contagem.entries()]
      .map(([id, quantidade]) => {
        const cat = porId.get(id);
        return {
          nome: cat?.nome ?? "Sem categoria",
          cor: cat?.cor ?? "#94a3b8",
          quantidade,
        };
      })
      .sort((a, b) => b.quantidade - a.quantidade);

    return {
      formato: data.formato,
      linhasLidas: itens.length + invalidas.length,
      aImportar: novos.length,
      duplicadasNoArquivo,
      jaExistentes: existentes.size,
      semCategoria: novos.filter((i) => !i.categoriaId).length,
      invalidas,
      periodo: datas.length ? { de: datas[0]!, ate: datas[datas.length - 1]! } : null,
      totais: { entradas, saidas },
      porCategoria,
      amostra: unicos.slice(0, 8).map((i) => ({
        data: i.data,
        descricao: i.descricao,
        valor: i.valor,
        tipo: i.tipo,
        categoria: i.categoriaId ? (porId.get(i.categoriaId)?.nome ?? null) : null,
        situacao: existentes.has(i.hash) ? ("DUPLICADA" as const) : ("NOVA" as const),
      })),
    };
  });

/**
 * Fase A3 — fallback de IA, passo 1 de 2: PROPOR.
 *
 * Roda depois do motor determinístico e só olha o que sobrou sem categoria.
 * Não grava nada: é o dry-run. O usuário confirma em `aplicarSugestoesIa`.
 *
 * LGPD: só as descrições distintas saem daqui para o modelo — nunca valor,
 * data, conta ou id. Ver `montarPrompt` em `categorize/ai/sugerir.server`.
 */
export const sugerirCategoriasPorIa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PreviaSugestoesIa> => {
    const { supabase } = context;

    const [{ data: pendentes, error }, { data: cats }] = await Promise.all([
      supabase
        .from("transacoes")
        .select("descricao")
        .is("categoria_id", null)
        .limit(LIMITE_SEM_CATEGORIA),
      supabase.from("categorias").select("id, nome, cor"),
    ]);
    if (error) throw new Error("Não foi possível carregar os lançamentos sem categoria.");

    // Agrupa por descrição: o modelo recebe cada estabelecimento uma só vez.
    const contagem = new Map<string, number>();
    for (const t of pendentes ?? []) {
      contagem.set(t.descricao, (contagem.get(t.descricao) ?? 0) + 1);
    }

    const categorias = (cats ?? []) as Array<{ id: string; nome: string; cor: string }>;
    const vazio: PreviaSugestoesIa = {
      totalSemCategoria: pendentes?.length ?? 0,
      descricoesConsultadas: 0,
      sugestoes: [],
      iaDisponivel: true,
    };
    if (!contagem.size || !categorias.length) return vazio;

    const { iaConfigurada } = await import("@/lib/ai/modelo.server");
    if (!iaConfigurada()) return { ...vazio, iaDisponivel: false };

    // Mais frequentes primeiro: se houver corte, corta o que menos importa.
    const descricoes = [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LIMITE_DESCRICOES_IA)
      .map(([descricao]) => descricao);

    const { sugerirCategorias } = await import("@/lib/categorize/ai/sugerir.server");
    const { IaIndisponivelError } = await import("@/lib/ai/modelo.server");

    let sugeridas: Array<{ descricao: string; categoria: string }>;
    try {
      sugeridas = await sugerirCategorias(
        descricoes,
        categorias.map((c) => c.nome),
      );
    } catch (erro) {
      // IA fora do ar não é erro do usuário: o determinístico segue de pé.
      if (erro instanceof IaIndisponivelError) {
        return { ...vazio, descricoesConsultadas: descricoes.length, iaDisponivel: false };
      }
      throw erro;
    }

    const porNome = new Map(categorias.map((c) => [c.nome, c]));

    // Regras do usuário já existentes: a prévia avisa quais serão atualizadas.
    const { data: regrasUsuario } = await supabase
      .from("regras_categorizacao")
      .select("palavra_chave")
      .not("usuario_id", "is", null);
    const chavesExistentes = new Set(
      ((regrasUsuario ?? []) as Array<{ palavra_chave: string }>).map((r) =>
        r.palavra_chave.toUpperCase(),
      ),
    );

    const sugestoes: SugestaoIa[] = [];
    for (const s of sugeridas) {
      const categoria = porNome.get(s.categoria);
      if (!categoria) continue;

      const palavraChave = extrairPalavraChave(s.descricao);
      sugestoes.push({
        descricao: s.descricao,
        categoriaId: categoria.id,
        categoriaNome: categoria.nome,
        categoriaCor: categoria.cor,
        quantidade: contagem.get(s.descricao) ?? 0,
        palavraChave,
        regraExistente: palavraChave ? chavesExistentes.has(palavraChave) : false,
      });
    }

    return {
      totalSemCategoria: pendentes?.length ?? 0,
      descricoesConsultadas: descricoes.length,
      sugestoes: sugestoes.sort((a, b) => b.quantidade - a.quantidade),
      iaDisponivel: true,
    };
  });

/**
 * Fase A3 — fallback de IA, passo 2 de 2: APLICAR o que o usuário confirmou.
 *
 * Grava a categoria com `categoria_origem = 'ia'` e promove cada sugestão a
 * `regra_categorizacao` (origem `ia`). É isso que faz o sistema ficar MAIS
 * determinístico com o tempo: na próxima importação o motor de regras pega
 * sozinho, sem chamar IA nenhuma.
 */
export const aplicarSugestoesIa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        aceitas: z
          .array(
            z.object({
              descricao: z.string().min(1).max(200),
              categoriaId: z.string().uuid(),
              /** Aplicar a categoria sem criar regra, se o usuário preferir. */
              criarRegra: z.boolean().default(true),
            }),
          )
          .min(1)
          .max(LIMITE_DESCRICOES_IA),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ResultadoSugestoesIa> =>
    // Lógica em `categorize/ai/aplicar` para ficar testável com um duplo.
    aplicarSugestoes(context.supabase, context.userId, data.aceitas),
  );

/**
 * Fase A4 — insight mensal em linguagem natural.
 *
 * Agrega o mês pedido e o anterior, manda SÓ os agregados ao modelo e devolve
 * o texto junto com os números que o embasam.
 *
 * Cache: guardado em `insights_mensais` com a impressão digital dos agregados.
 * Se os números mudarem (import novo, recategorização), a impressão muda e o
 * texto é regerado sozinho — sem TTL arbitrário. `forcar` ignora o cache.
 *
 * LGPD: nenhuma transação individual sai daqui. Ver `agregar.ts`.
 */
export const insightMensal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mes: z.string().regex(/^\d{4}-\d{2}$/),
        forcar: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<InsightMensal> => {
    const { supabase, userId } = context;

    const mesAnterior = mesAnteriorDe(data.mes);
    const atual = intervaloDoMes(data.mes);
    const anterior = intervaloDoMes(mesAnterior);

    const [linhasAtual, linhasAnterior, { data: cats }] = await Promise.all([
      supabase
        .from("transacoes")
        .select("valor, tipo, categoria_id")
        .gte("data", atual.inicio)
        .lt("data", atual.fim),
      supabase
        .from("transacoes")
        .select("valor, tipo, categoria_id")
        .gte("data", anterior.inicio)
        .lt("data", anterior.fim),
      supabase.from("categorias").select("id, nome"),
    ]);
    if (linhasAtual.error || linhasAnterior.error) {
      throw new Error("Não foi possível carregar os dados do mês.");
    }

    const nomePorId = new Map(
      ((cats ?? []) as Array<{ id: string; nome: string }>).map((c) => [c.id, c.nome]),
    );
    const paraAgregacao = (
      linhas: Array<{ valor: unknown; tipo: unknown; categoria_id: unknown }>,
    ) =>
      linhas.map((l): LinhaAgregacao => ({
        valor: Number(l.valor),
        tipo: l.tipo as LinhaAgregacao["tipo"],
        categoriaId: (l.categoria_id as string | null) ?? null,
      }));

    const agregado = agregarMes(
      data.mes,
      paraAgregacao(linhasAtual.data ?? []),
      paraAgregacao(linhasAnterior.data ?? []),
      nomePorId,
    );

    // Mês sem gasto nenhum não rende análise — e não vale uma chamada de IA.
    if (!agregado.totalSaidas && !agregado.totalSaidasAnterior) {
      return { texto: null, agregado, doCache: false, geradoEm: null, iaDisponivel: true };
    }

    const impressao = await impressaoAgregado(agregado);

    const { data: guardado } = await supabase
      .from("insights_mensais")
      .select("texto, impressao, gerado_em")
      .eq("mes", data.mes)
      .maybeSingle();

    if (!data.forcar && guardado && guardado.impressao === impressao) {
      return {
        texto: guardado.texto,
        agregado,
        doCache: true,
        geradoEm: guardado.gerado_em,
        iaDisponivel: true,
      };
    }

    const { iaConfigurada, IaIndisponivelError, chamarModelo } =
      await import("@/lib/ai/modelo.server");
    if (!iaConfigurada()) {
      // Sem IA os números continuam de pé — só o texto falta.
      return { texto: null, agregado, doCache: false, geradoEm: null, iaDisponivel: false };
    }

    const { montarPromptInsight } = await import("@/lib/insights/agregar");
    const { system, user } = montarPromptInsight(agregado);

    let texto: string;
    try {
      texto = await chamarModelo({ system, user, esforco: "baixo", maxTokens: 4000 });
    } catch (erro) {
      if (erro instanceof IaIndisponivelError) {
        // Texto velho é melhor que nada, desde que o front diga que é velho.
        return {
          texto: guardado?.texto ?? null,
          agregado,
          doCache: Boolean(guardado),
          geradoEm: guardado?.gerado_em ?? null,
          iaDisponivel: false,
        };
      }
      throw erro;
    }

    const geradoEm = new Date().toISOString();
    await supabase
      .from("insights_mensais")
      .upsert(
        { usuario_id: userId, mes: data.mes, texto, impressao, gerado_em: geradoEm },
        { onConflict: "usuario_id,mes" },
      );

    return { texto, agregado, doCache: false, geradoEm, iaDisponivel: true };
  });

/**
 * Fase B1 — executa uma ferramenta do agente isoladamente, sob a sessão.
 *
 * Existe para as ferramentas serem chamáveis e testáveis antes do loop de tool
 * use da Fase B2, e é o mesmo ponto de entrada que o agente usará depois.
 *
 * SEGURANÇA: o `userId` vem do middleware, nunca do input. Ferramentas de
 * escrita são recusadas aqui — a Fase B3 as transforma em proposta com
 * confirmação. Assim nenhuma escrita disparada por modelo escapa por engano.
 */
export const executarFerramentaAgente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nome: z.string().min(1).max(60),
        args: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ nome: string; resultadoJson: string }> => {
    const { ehLeitura } = await import("@/lib/agente/ferramentas");
    if (!ehLeitura(data.nome)) {
      throw new Error(
        `A ferramenta "${data.nome}" altera dados e precisa de confirmação explícita.`,
      );
    }

    const { executarCapacidade } = await import("@/lib/capacidades");
    const resultado = await executarCapacidade(
      data.nome,
      { supabase: context.supabase, userId: context.userId },
      data.args,
    );

    // Serializado de propósito: é exatamente a forma que o `tool_result` do
    // loop da Fase B2 precisa, e evita o serializador do Start recusar
    // um payload de forma dinâmica.
    return { nome: data.nome, resultadoJson: JSON.stringify(resultado) };
  });

/**
 * Fase B3 — executa uma ação que o agente PROPÔS e o usuário confirmou.
 *
 * O agente nunca chega aqui sozinho: o loop de conversa transforma toda
 * capacidade de escrita em proposta e devolve ao modelo um resultado marcado
 * como pendente. Só um clique do usuário aciona esta função.
 *
 * SEGURANÇA: isto é uma ação do USUÁRIO, não do modelo — por isso não há
 * problema em os argumentos virem do cliente. Eles são validados contra o
 * schema da capacidade, o `userId` vem da sessão e o RLS delimita o alcance.
 * O que a confirmação protege é o usuário contra escrita silenciosa, não o
 * banco contra o usuário: ele já pode criar transação e regra pela interface.
 */
export const confirmarAcaoAgente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nome: z.string().min(1).max(60),
        args: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ nome: string; descricao: string; resultadoJson: string }> => {
      const { capacidadePorNome, executarCapacidade } = await import("@/lib/capacidades");

      const capacidade = capacidadePorNome(data.nome);
      if (!capacidade) throw new Error("Ação desconhecida.");
      if (capacidade.natureza !== "escrita") {
        // Leitura não precisa de confirmação e não deve passar por aqui:
        // manter os caminhos separados evita que um vire atalho do outro.
        throw new Error("Esta ação não exige confirmação.");
      }

      const resultado = await executarCapacidade(
        data.nome,
        { supabase: context.supabase, userId: context.userId },
        data.args,
      );

      // Mesma frase que o usuário viu ao confirmar — o front ecoa no histórico.
      const { data: categorias } = await context.supabase.from("categorias").select("id, nome");
      const nomes = new Map(
        ((categorias ?? []) as Array<{ id: string; nome: string }>).map((c) => [c.id, c.nome]),
      );

      return {
        nome: data.nome,
        descricao:
          capacidade.descreverAcao?.(data.args, (id) => nomes.get(id)) ?? capacidade.titulo,
        resultadoJson: JSON.stringify(resultado),
      };
    },
  );
