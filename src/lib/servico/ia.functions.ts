/** Recursos de IA: sugestão de categoria (propor e aplicar) e insight mensal. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aplicarSugestoes } from "@/lib/categorize/ai/aplicar";
import { extrairPalavraChave } from "@/lib/categorize/ai/palavra-chave";
import {
  agregarMes,
  impressaoAgregado,
  intervaloDoMes,
  mesAnteriorDe,
  type LinhaAgregacao,
} from "@/lib/insights/agregar";
import type {
  InsightMensal,
  PreviaSugestoesIa,
  ResultadoSugestoesIa,
  SugestaoIa,
} from "@/lib/types/dominio";

import { LIMITE_DESCRICOES_IA, LIMITE_SEM_CATEGORIA } from "./compartilhado";

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
