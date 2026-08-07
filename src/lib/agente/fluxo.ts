/**
 * Leitura do NDJSON que a rota do agente devolve. Função pura sobre um
 * `ReadableStream` — por isso dá para testar o parsing sem servidor, que é a
 * parte onde erro silencioso dói: um chunk cortado no meio de uma linha viraria
 * texto perdido na tela.
 */
import type { EventoAgente } from "./conversa";

/**
 * Emite um evento por linha completa. A rede não respeita fronteira de linha:
 * um `enqueue` pode chegar partido, então o resto fica no buffer até fechar.
 */
export async function* lerEventos(corpo: ReadableStream<Uint8Array>): AsyncGenerator<EventoAgente> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;

      buffer += decodificador.decode(value, { stream: true });

      let quebra = buffer.indexOf("\n");
      while (quebra !== -1) {
        const linha = buffer.slice(0, quebra).trim();
        buffer = buffer.slice(quebra + 1);
        const evento = interpretarLinha(linha);
        if (evento) yield evento;
        quebra = buffer.indexOf("\n");
      }
    }

    // Última linha pode vir sem \n final.
    const resto = interpretarLinha(buffer.trim());
    if (resto) yield resto;
  } finally {
    leitor.releaseLock();
  }
}

/** Linha ilegível é descartada: uma linha ruim não derruba a conversa. */
function interpretarLinha(linha: string): EventoAgente | null {
  if (!linha) return null;
  try {
    return JSON.parse(linha) as EventoAgente;
  } catch {
    return null;
  }
}
