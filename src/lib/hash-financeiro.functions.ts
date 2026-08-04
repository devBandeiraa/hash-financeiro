/**
 * Server functions do Hash Financeiro. Toda leitura/escrita passa por
 * `requireSupabaseAuth`: o cliente age como o usuário logado e o RLS do banco
 * garante o isolamento. Nenhum dado financeiro é logado.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseCsv } from "@/lib/import/csv.parser";
import { parseOfx } from "@/lib/import/ofx.parser";
import { calcularHashDedupe } from "@/lib/import/dedupe";
import { categorizar } from "@/lib/categorize/engine";
import type {
  Categoria,
  Conta,
  PreviaImportacao,
  RegraCategorizacao,
  ResultadoImportacao,
  TipoConta,
  TipoTransacao,
  Transacao,
} from "@/lib/types/dominio";

const LIMITE_LINHAS = 5000;

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

async function buscarRegras(
  supabase: { from: (t: "regras_categorizacao") => any },
): Promise<RegraCategorizacao[]> {
  const { data, error } = await supabase
    .from("regras_categorizacao")
    .select("id, usuario_id, palavra_chave, categoria_id, prioridade, ativa");
  if (error) throw new Error("Não foi possível carregar as regras.");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r["id"] as string,
    usuarioId: (r["usuario_id"] as string | null) ?? null,
    palavraChave: r["palavra_chave"] as string,
    categoriaId: r["categoria_id"] as string,
    prioridade: r["prioridade"] as number,
    ativa: r["ativa"] as boolean,
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
        formato: z.enum(["CSV", "OFX"]),
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
      data.formato === "OFX" ? parseOfx(data.conteudo) : parseCsv(data.conteudo);

    if (linhas.length > LIMITE_LINHAS) {
      throw new Error(`Arquivo grande demais: máximo de ${LIMITE_LINHAS} lançamentos por importação.`);
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
        mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        categoriaId: z.string().uuid().nullable().optional(),
        busca: z.string().trim().max(60).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<Transacao[]> => {
    let query = context.supabase
      .from("transacoes")
      .select("id, conta_id, data, descricao, valor, tipo, categoria_id, origem")
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
      origem: t.origem,
    }));
  });

export const atualizarCategoriaTransacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), categoriaId: z.string().uuid().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transacoes")
      .update({ categoria_id: data.categoriaId })
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
        .update({ categoria_id: categoriaId })
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
    z
      .object({ mes: z.string().regex(/^\d{4}-\d{2}$/) })
      .parse(input),
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
        formato: z.enum(["CSV", "OFX"]),
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
      data.formato === "OFX" ? parseOfx(data.conteudo) : parseCsv(data.conteudo);

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
