import { describe, expect, it } from "vitest";

import { lerEventos } from "@/lib/agente/fluxo";
import type { EventoAgente } from "@/lib/agente/conversa";

/** Stream que entrega exatamente os pedaços dados — inclusive partidos. */
function fluxoDe(pedacos: string[]): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of pedacos) c.enqueue(codificador.encode(p));
      c.close();
    },
  });
}

async function coletar(pedacos: string[]): Promise<EventoAgente[]> {
  const eventos: EventoAgente[] = [];
  for await (const e of lerEventos(fluxoDe(pedacos))) eventos.push(e);
  return eventos;
}

describe("lerEventos", () => {
  it("lê um evento por linha", async () => {
    const eventos = await coletar([
      '{"tipo":"ferramenta","nome":"resumo_dashboard"}\n',
      '{"tipo":"texto","conteudo":"Você gastou "}\n',
      '{"tipo":"texto","conteudo":"R$ 880,00."}\n',
    ]);
    expect(eventos).toEqual([
      { tipo: "ferramenta", nome: "resumo_dashboard" },
      { tipo: "texto", conteudo: "Você gastou " },
      { tipo: "texto", conteudo: "R$ 880,00." },
    ]);
  });

  it("junta linha partida entre dois chunks — a rede não respeita quebra", async () => {
    const eventos = await coletar(['{"tipo":"texto","con', 'teudo":"oi"}\n']);
    expect(eventos).toEqual([{ tipo: "texto", conteudo: "oi" }]);
  });

  it("aceita vários eventos num único chunk", async () => {
    const eventos = await coletar([
      '{"tipo":"texto","conteudo":"a"}\n{"tipo":"texto","conteudo":"b"}\n',
    ]);
    expect(eventos).toHaveLength(2);
  });

  it("lê a última linha mesmo sem \n final", async () => {
    const eventos = await coletar(['{"tipo":"texto","conteudo":"fim"}']);
    expect(eventos).toEqual([{ tipo: "texto", conteudo: "fim" }]);
  });

  it("não quebra com caractere multibyte partido ao meio", async () => {
    // "é" em UTF-8 são dois bytes; o chunk corta entre eles.
    const bytes = new TextEncoder().encode('{"tipo":"texto","conteudo":"café"}\n');
    const corte = bytes.indexOf(233) > 0 ? bytes.indexOf(233) : 30;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, corte + 1));
        c.enqueue(bytes.slice(corte + 1));
        c.close();
      },
    });
    const eventos: EventoAgente[] = [];
    for await (const e of lerEventos(stream)) eventos.push(e);
    expect(eventos).toEqual([{ tipo: "texto", conteudo: "café" }]);
  });

  it("descarta linha ilegível sem derrubar as seguintes", async () => {
    const eventos = await coletar(["isso não é json\n", '{"tipo":"texto","conteudo":"ok"}\n']);
    expect(eventos).toEqual([{ tipo: "texto", conteudo: "ok" }]);
  });

  it("ignora linhas em branco", async () => {
    const eventos = await coletar(['\n\n{"tipo":"texto","conteudo":"x"}\n\n']);
    expect(eventos).toHaveLength(1);
  });
});

describe("autenticação da rota de streaming", () => {
  async function autenticar(cabecalhos: Record<string, string>) {
    process.env["SUPABASE_URL"] ??= "https://exemplo.supabase.co";
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??= "sb_publishable_teste";
    const { autenticarRequisicao, NaoAutorizadoError } =
      await import("@/lib/agente/autenticar.server");
    return { autenticarRequisicao, NaoAutorizadoError, cabecalhos };
  }

  it("recusa requisição sem Authorization", async () => {
    const { autenticarRequisicao, NaoAutorizadoError } = await autenticar({});
    await expect(
      autenticarRequisicao(new Request("http://x/api/agente/chat", { method: "POST" })),
    ).rejects.toBeInstanceOf(NaoAutorizadoError);
  });

  it("recusa esquema que não seja Bearer", async () => {
    const { autenticarRequisicao, NaoAutorizadoError } = await autenticar({});
    await expect(
      autenticarRequisicao(
        new Request("http://x/api/agente/chat", {
          method: "POST",
          headers: { authorization: "Basic abc" },
        }),
      ),
    ).rejects.toBeInstanceOf(NaoAutorizadoError);
  });

  it("recusa token que não tem forma de JWT, sem ir à rede", async () => {
    const { autenticarRequisicao, NaoAutorizadoError } = await autenticar({});
    await expect(
      autenticarRequisicao(
        new Request("http://x/api/agente/chat", {
          method: "POST",
          headers: { authorization: "Bearer nao-e-jwt" },
        }),
      ),
    ).rejects.toBeInstanceOf(NaoAutorizadoError);
  });
});
