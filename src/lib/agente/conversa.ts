/**
 * Loop de tool use do agente.
 *
 * Independe de provedor e de banco: recebe um `ClienteModelo` e um executor de
 * ferramenta, e emite eventos. É o que permite testar o loop inteiro — modelo
 * pedindo ferramenta, encadeando duas, estourando o limite — sem rede.
 *
 * Escrita NUNCA executa aqui. Capacidade de escrita vira uma proposta que sobe
 * para o front; ao modelo devolvemos um resultado dizendo que está pendente,
 * então ele naturalmente pergunta em vez de afirmar que fez.
 */
import type {
  ChamadaFerramenta,
  ClienteModelo,
  DeclaracaoFerramenta,
  TurnoConversa,
} from "@/lib/ai/modelo.server";

/** Evento que sobe para o front, um por linha no corpo da resposta. */
export type EventoAgente =
  | { tipo: "texto"; conteudo: string }
  | { tipo: "ferramenta"; nome: string }
  | { tipo: "proposta"; id: string; nome: string; descricao: string; args: Record<string, unknown> }
  | { tipo: "fim"; historico: TurnoConversa[] }
  | { tipo: "erro"; mensagem: string };

export interface OpcoesConversa {
  cliente: ClienteModelo;
  system: string;
  historico: TurnoConversa[];
  ferramentas: DeclaracaoFerramenta[];
  /** Executa uma ferramenta de LEITURA. Deve devolver JSON serializado. */
  executarLeitura: (chamada: ChamadaFerramenta) => Promise<string>;
  /** `true` se a ferramenta altera dados — aí vira proposta. */
  ehEscrita: (nome: string) => boolean;
  /** Frase de confirmação de uma ação de escrita. */
  descreverEscrita: (nome: string, args: Record<string, unknown>) => string;
  /** Teto de idas e voltas por mensagem. Padrão 6. */
  maxIteracoes?: number;
  signal?: AbortSignal;
}

const MAX_ITERACOES_PADRAO = 6;

export async function* conversarComAgente(opcoes: OpcoesConversa): AsyncGenerator<EventoAgente> {
  const {
    cliente,
    system,
    ferramentas,
    executarLeitura,
    ehEscrita,
    descreverEscrita,
    maxIteracoes = MAX_ITERACOES_PADRAO,
    signal = new AbortController().signal,
  } = opcoes;

  if (!cliente.conversar) {
    yield { tipo: "erro", mensagem: "O provedor de IA configurado não suporta conversa." };
    return;
  }

  const historico: TurnoConversa[] = [...opcoes.historico];

  for (let iteracao = 0; iteracao < maxIteracoes; iteracao += 1) {
    let texto = "";
    let chamadas: ChamadaFerramenta[] = [];

    for await (const evento of cliente.conversar({ system, historico, ferramentas }, signal)) {
      if (evento.tipo === "texto") {
        texto += evento.conteudo;
        yield { tipo: "texto", conteudo: evento.conteudo };
        continue;
      }
      chamadas = evento.chamadas;
    }

    historico.push({ papel: "modelo", texto, chamadas });

    // Sem ferramenta pedida, o modelo já respondeu: acabou.
    if (!chamadas.length) {
      yield { tipo: "fim", historico };
      return;
    }

    const respostas: Array<{ id: string; nome: string; conteudo: string }> = [];

    for (const chamada of chamadas) {
      if (ehEscrita(chamada.nome)) {
        yield {
          tipo: "proposta",
          id: chamada.id,
          nome: chamada.nome,
          descricao: descreverEscrita(chamada.nome, chamada.args),
          args: chamada.args,
        };
        respostas.push({
          id: chamada.id,
          nome: chamada.nome,
          conteudo: JSON.stringify({
            pendente: true,
            aviso:
              "Ação proposta ao usuário, ainda NÃO executada. Peça a confirmação dele e não afirme que já foi feita.",
          }),
        });
        continue;
      }

      yield { tipo: "ferramenta", nome: chamada.nome };
      try {
        respostas.push({
          id: chamada.id,
          nome: chamada.nome,
          conteudo: await executarLeitura(chamada),
        });
      } catch (erro) {
        // O erro volta como resultado, não como exceção: o modelo consegue
        // corrigir o argumento e tentar de novo, ou avisar o usuário.
        respostas.push({
          id: chamada.id,
          nome: chamada.nome,
          conteudo: JSON.stringify({
            erro: erro instanceof Error ? erro.message : "falha ao executar a ferramenta",
          }),
        });
      }
    }

    historico.push({ papel: "ferramenta", respostas });
  }

  yield {
    tipo: "erro",
    mensagem: "O assistente fez consultas demais para uma só pergunta. Tente algo mais específico.",
  };
}
