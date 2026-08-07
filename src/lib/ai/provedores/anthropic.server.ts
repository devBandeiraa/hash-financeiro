/**
 * Provedor Anthropic (Claude) — pago, sem tier gratuito.
 *
 * Mantido como alternativa a um `IA_PROVEDOR=anthropic` no `.env`. Ao
 * contrário do tier gratuito do Gemini, a API da Anthropic não treina em
 * input de API — é a opção a considerar se o custo por chamada deixar de ser
 * o critério dominante.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ErroProvedor, IaIndisponivelError } from "../modelo.server";
import type { ClienteModelo } from "../modelo.server";

const MODELO_PADRAO = "claude-opus-5";
const MAX_TOKENS_PADRAO = 16_000;

function normalizarErro(erro: unknown): ErroProvedor {
  if (erro instanceof Anthropic.APIError) {
    const status = erro.status ?? 0;
    const transitorio =
      erro instanceof Anthropic.RateLimitError ||
      erro instanceof Anthropic.APIConnectionError ||
      status >= 500;
    return new ErroProvedor(`${erro.constructor.name}(status=${status || "?"})`, transitorio);
  }
  if (erro instanceof Error) {
    const rede = erro.name === "AbortError" || erro.name === "TimeoutError";
    return new ErroProvedor(erro.name, rede);
  }
  return new ErroProvedor("erro desconhecido", false);
}

export function criarClienteAnthropic(): ClienteModelo {
  const chave = process.env["ANTHROPIC_API_KEY"]?.trim();
  if (!chave) throw new IaIndisponivelError("ANTHROPIC_API_KEY não configurada");

  const modelo = process.env["ANTHROPIC_MODEL"]?.trim() || MODELO_PADRAO;
  // maxRetries: 0 porque o retry é do `chamarModelo` — assim o deadline total
  // é previsível em vez de multiplicado pelo SDK.
  const sdk = new Anthropic({ apiKey: chave, maxRetries: 0 });

  return {
    async gerar(pedido, signal) {
      try {
        const resposta = await sdk.messages.create(
          {
            model: modelo,
            max_tokens: pedido.maxTokens ?? MAX_TOKENS_PADRAO,
            system: pedido.system,
            messages: [{ role: "user", content: pedido.user }],
            output_config: {
              effort: pedido.esforco === "baixo" ? "low" : "medium",
              // Prefill de assistant retorna 400 no Opus 5: o formato vem daqui.
              ...(pedido.esquema ? { format: zodOutputFormat(pedido.esquema) } : {}),
            },
          },
          { signal },
        );

        if (resposta.stop_reason === "refusal") {
          throw new IaIndisponivelError("modelo recusou o pedido");
        }

        // Só os blocos de texto: no Opus 5 o raciocínio vem como bloco à parte.
        return resposta.content
          .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
          .map((bloco) => bloco.text)
          .join("");
      } catch (erro) {
        if (erro instanceof IaIndisponivelError) throw erro;
        throw normalizarErro(erro);
      }
    },
  };
}
