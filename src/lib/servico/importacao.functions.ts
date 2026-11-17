/** Importação de extrato (CSV ou PDF): prévia sem gravar e importação de fato. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { categorizar } from "@/lib/categorize/engine";
import { parseCsv } from "@/lib/import/csv.parser";
import { calcularHashDedupe } from "@/lib/import/dedupe";
import { parsePdfTexto } from "@/lib/import/pdf.parser";
import type { PreviaImportacao, ResultadoImportacao } from "@/lib/types/dominio";

import { buscarRegras, LIMITE_LINHAS } from "./compartilhado";

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
