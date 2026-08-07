/**
 * Provedor Gemini (Google AI Studio) — tier gratuito.
 *
 * ATENÇÃO (LGPD): no tier gratuito o Google pode usar os prompts para treinar
 * modelo. Aqui só trafega a *descrição* do lançamento (ver `montarPrompt` em
 * `categorize/ai/sugerir.server.ts`) e agregados nos insights — nunca valor,
 * saldo, conta ou titular. Ainda assim, essa escolha está documentada no
 * README: é decisão consciente de custo, não descuido.
 */
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import * as z from "zod/v4";

import { ErroProvedor, IaIndisponivelError } from "../modelo.server";
import type { ClienteModelo } from "../modelo.server";

/**
 * `flash-lite` é o tier certo para classificar descrição: tarefa curta, e a
 * cota do plano gratuito é por requisição. Versão fixada de propósito — os
 * apelidos `-latest` mudam de modelo sob os pés.
 *
 * Não use `gemini-2.5-flash`: o Google o aposentou para chaves novas (404).
 */
const MODELO_PADRAO = "gemini-3.1-flash-lite";

/**
 * `responseJsonSchema` aceita JSON Schema, mas só um subconjunto de chaves —
 * `$schema` não está na lista e faz a requisição falhar.
 */
function esquemaParaGemini(esquema: z.ZodType): unknown {
  const json = z.toJSONSchema(esquema) as Record<string, unknown>;
  delete json["$schema"];
  return json;
}

function normalizarErro(erro: unknown): ErroProvedor {
  if (erro instanceof ApiError) {
    // 429 = cota do tier gratuito estourada; 5xx = instabilidade. Ambos passam.
    const transitorio = erro.status === 429 || erro.status >= 500;
    return new ErroProvedor(`ApiError(status=${erro.status})`, transitorio);
  }
  if (erro instanceof Error) {
    const rede = erro.name === "AbortError" || erro.name === "TimeoutError";
    return new ErroProvedor(erro.name, rede);
  }
  return new ErroProvedor("erro desconhecido", false);
}

export function criarClienteGemini(): ClienteModelo {
  const chave = process.env["GEMINI_API_KEY"]?.trim();
  if (!chave) throw new IaIndisponivelError("GEMINI_API_KEY não configurada");

  const modelo = process.env["GEMINI_MODEL"]?.trim() || MODELO_PADRAO;
  const ai = new GoogleGenAI({ apiKey: chave });

  return {
    async gerar(pedido, signal) {
      try {
        const resposta = await ai.models.generateContent({
          model: modelo,
          contents: pedido.user,
          config: {
            systemInstruction: pedido.system,
            abortSignal: signal,
            ...(pedido.maxTokens ? { maxOutputTokens: pedido.maxTokens } : {}),
            // `thinkingLevel` e não `thinkingBudget`: o budget numérico é
            // rejeitado com 400 pelos modelos 3.x mais novos (gemini-3.6-flash,
            // *-latest). O nível funciona em toda a linha atual.
            ...(pedido.esforco === "baixo"
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            ...(pedido.esquema
              ? {
                  responseMimeType: "application/json",
                  responseJsonSchema: esquemaParaGemini(pedido.esquema),
                }
              : {}),
          },
        });

        return resposta.text ?? "";
      } catch (erro) {
        throw normalizarErro(erro);
      }
    },
  };
}
