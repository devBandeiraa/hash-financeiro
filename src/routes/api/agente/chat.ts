/**
 * Rota do agente conversacional. Responde em NDJSON: um evento por linha,
 * enviado assim que acontece — o front pinta o texto conforme chega.
 *
 * É rota, e não server function, porque server function serializa a resposta
 * inteira antes de devolver, o que acabaria com o streaming.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const entrada = z.object({
  mensagem: z.string().trim().min(1).max(2000),
  /** Histórico da sessão, devolvido pelo servidor a cada resposta. */
  historico: z
    .array(
      z.union([
        z.object({ papel: z.literal("usuario"), texto: z.string() }),
        z.object({
          papel: z.literal("modelo"),
          texto: z.string(),
          chamadas: z.array(
            z.object({
              id: z.string(),
              nome: z.string(),
              args: z.record(z.string(), z.unknown()),
              assinatura: z.string().optional(),
            }),
          ),
        }),
        z.object({
          papel: z.literal("ferramenta"),
          respostas: z.array(z.object({ id: z.string(), nome: z.string(), conteudo: z.string() })),
        }),
      ]),
    )
    .max(40)
    .default([]),
});

export const Route = createFileRoute("/api/agente/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { autenticarRequisicao, NaoAutorizadoError } =
          await import("@/lib/agente/autenticar.server");

        let contexto;
        try {
          contexto = await autenticarRequisicao(request);
        } catch (erro) {
          const naoAutorizado = erro instanceof NaoAutorizadoError;
          return Response.json(
            { erro: naoAutorizado ? erro.message : "Falha de configuração do servidor." },
            { status: naoAutorizado ? 401 : 500 },
          );
        }

        const corpo = entrada.safeParse(await request.json().catch(() => null));
        if (!corpo.success) {
          return Response.json({ erro: "Mensagem inválida." }, { status: 400 });
        }

        const { clientePadrao, iaConfigurada } = await import("@/lib/ai/modelo.server");
        if (!iaConfigurada()) {
          return Response.json({ erro: "O assistente não está configurado." }, { status: 503 });
        }

        const { conversarComAgente } = await import("@/lib/agente/conversa");
        const { montarSystemAgente } = await import("@/lib/agente/prompt");
        const { FERRAMENTAS_AGENTE, ehLeitura } = await import("@/lib/agente/ferramentas");
        const { executarCapacidade, capacidadePorNome } = await import("@/lib/capacidades");

        const cliente = await clientePadrao();
        const historico = [
          ...corpo.data.historico,
          { papel: "usuario" as const, texto: corpo.data.mensagem },
        ];

        const eventos = conversarComAgente({
          cliente,
          system: montarSystemAgente(),
          historico,
          ferramentas: FERRAMENTAS_AGENTE,
          ehEscrita: (nome) => !ehLeitura(nome),
          descreverEscrita: (nome, args) =>
            capacidadePorNome(nome)?.descreverAcao?.(args) ?? `Executar ${nome}`,
          executarLeitura: async (chamada) =>
            JSON.stringify(await executarCapacidade(chamada.nome, contexto, chamada.args)),
          signal: request.signal,
        });

        const codificador = new TextEncoder();
        const fluxo = new ReadableStream<Uint8Array>({
          async start(controlador) {
            try {
              for await (const evento of eventos) {
                controlador.enqueue(codificador.encode(`${JSON.stringify(evento)}\n`));
              }
            } catch (erro) {
              // Nada de dado financeiro em log: só o nome do erro.
              console.error(
                `[agente] falha: ${erro instanceof Error ? erro.name : "desconhecida"}`,
              );
              controlador.enqueue(
                codificador.encode(
                  `${JSON.stringify({ tipo: "erro", mensagem: "O assistente falhou. Tente de novo." })}\n`,
                ),
              );
            } finally {
              controlador.close();
            }
          },
        });

        return new Response(fluxo, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
