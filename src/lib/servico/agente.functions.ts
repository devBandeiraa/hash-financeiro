/** Ferramentas do agente: leitura direta e escrita só com confirmação. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
