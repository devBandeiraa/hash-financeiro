import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { conversarComAgente, type EventoAgente } from "@/lib/agente/conversa";
import { montarSystemAgente } from "@/lib/agente/prompt";
import { FERRAMENTAS_AGENTE, ehLeitura } from "@/lib/agente/ferramentas";
import type { ClienteModelo, EventoModelo } from "@/lib/ai/modelo.server";

/** Um turno pré-programado do modelo: texto em pedaços e/ou chamadas. */
type TurnoFake = { texto?: string[]; chamadas?: Array<{ nome: string; args?: object }> };

function clienteFake(turnos: TurnoFake[]): ClienteModelo & { vistos: number } {
  let i = 0;
  const cliente = {
    vistos: 0,
    gerar: async () => "",
    async *conversar(): AsyncIterable<EventoModelo> {
      const turno = turnos[i] ?? {};
      i += 1;
      cliente.vistos = i;
      for (const pedaco of turno.texto ?? []) {
        yield { tipo: "texto", conteudo: pedaco };
      }
      if (turno.chamadas?.length) {
        yield {
          tipo: "chamadas",
          chamadas: turno.chamadas.map((c, n) => ({
            id: `c${i}-${n}`,
            nome: c.nome,
            args: (c.args ?? {}) as Record<string, unknown>,
          })),
        };
      }
    },
  };
  return cliente;
}

async function coletar(gerador: AsyncGenerator<EventoAgente>): Promise<EventoAgente[]> {
  const eventos: EventoAgente[] = [];
  for await (const e of gerador) eventos.push(e);
  return eventos;
}

const base = {
  system: "s",
  historico: [{ papel: "usuario" as const, texto: "quanto gastei com transporte esse mês?" }],
  ferramentas: FERRAMENTAS_AGENTE,
  ehEscrita: (nome: string) => !ehLeitura(nome),
  descreverEscrita: (nome: string) => `Vou ${nome}`,
};

describe("montarSystemAgente", () => {
  it("informa a data — sem ela o modelo erra 'esse mês' em silêncio", () => {
    const s = montarSystemAgente(new Date("2026-08-07T12:00:00Z"));
    expect(s).toContain("2026-08-07");
    expect(s).toContain("2026-08");
  });

  it("proíbe inventar número e escopa a finanças pessoais", () => {
    const s = montarSystemAgente();
    expect(s).toMatch(/nunca invente/i);
    expect(s).toMatch(/fora de finanças pessoais/i);
    expect(s).toMatch(/PROPOSTAS/);
  });
});

describe("conversarComAgente", () => {
  it("transmite o texto em pedaços, na ordem", async () => {
    const cliente = clienteFake([{ texto: ["Você gastou ", "R$ 880,00."] }]);
    const eventos = await coletar(
      conversarComAgente({ ...base, cliente, executarLeitura: async () => "" }),
    );

    expect(eventos.filter((e) => e.tipo === "texto").map((e) => e.conteudo)).toEqual([
      "Você gastou ",
      "R$ 880,00.",
    ]);
    expect(eventos.at(-1)?.tipo).toBe("fim");
  });

  it("executa a ferramenta pedida e devolve o resultado ao modelo", async () => {
    const cliente = clienteFake([
      { chamadas: [{ nome: "resumo_dashboard", args: { mes: "2026-08" } }] },
      { texto: ["Você gastou R$ 880,00 com Transporte."] },
    ]);
    const recebidos: string[] = [];

    const eventos = await coletar(
      conversarComAgente({
        ...base,
        cliente,
        executarLeitura: async (c) => {
          recebidos.push(c.nome);
          return JSON.stringify({ saidas: 880 });
        },
      }),
    );

    expect(recebidos).toEqual(["resumo_dashboard"]);
    expect(eventos.some((e) => e.tipo === "ferramenta" && e.nome === "resumo_dashboard")).toBe(
      true,
    );
    expect(
      eventos
        .filter((e) => e.tipo === "texto")
        .map((e) => e.conteudo)
        .join(""),
    ).toContain("880,00");

    const fim = eventos.at(-1);
    expect(fim?.tipo).toBe("fim");
    // O histórico devolvido precisa conter o resultado, senão o próximo turno
    // perde o contexto e o modelo reconsulta ou inventa.
    if (fim?.tipo === "fim") {
      expect(fim.historico.some((t) => t.papel === "ferramenta")).toBe(true);
    }
  });

  it("encadeia duas ferramentas na sequência", async () => {
    const cliente = clienteFake([
      { chamadas: [{ nome: "listar_contas_categorias" }] },
      { chamadas: [{ nome: "listar_transacoes", args: { limite: 5 } }] },
      { texto: ["Pronto."] },
    ]);
    const ordem: string[] = [];

    await coletar(
      conversarComAgente({
        ...base,
        cliente,
        executarLeitura: async (c) => {
          ordem.push(c.nome);
          return "{}";
        },
      }),
    );

    expect(ordem).toEqual(["listar_contas_categorias", "listar_transacoes"]);
  });

  it("não executa escrita: vira proposta e o modelo é avisado que está pendente", async () => {
    const cliente = clienteFake([
      { chamadas: [{ nome: "criar_regra", args: { palavraChave: "UBER" } }] },
      { texto: ["Vou criar a regra UBER → Transporte. Confirma?"] },
    ]);
    let executou = false;

    const eventos = await coletar(
      conversarComAgente({
        ...base,
        cliente,
        executarLeitura: async () => {
          executou = true;
          return "{}";
        },
      }),
    );

    expect(executou).toBe(false);
    const proposta = eventos.find((e) => e.tipo === "proposta");
    expect(proposta).toMatchObject({ nome: "criar_regra", args: { palavraChave: "UBER" } });

    // O modelo recebe "pendente", que é o que o impede de dizer que já criou.
    const fim = eventos.at(-1);
    if (fim?.tipo === "fim") {
      const turno = fim.historico.find((t) => t.papel === "ferramenta");
      expect(turno?.papel === "ferramenta" && turno.respostas[0]?.conteudo).toContain("pendente");
    }
  });

  it("devolve o erro da ferramenta ao modelo em vez de derrubar a conversa", async () => {
    const cliente = clienteFake([
      { chamadas: [{ nome: "listar_transacoes" }] },
      { texto: ["Não consegui consultar agora."] },
    ]);

    const eventos = await coletar(
      conversarComAgente({
        ...base,
        cliente,
        executarLeitura: async () => {
          throw new Error("Argumentos inválidos para listar_transacoes");
        },
      }),
    );

    expect(eventos.at(-1)?.tipo).toBe("fim");
    const fim = eventos.at(-1);
    if (fim?.tipo === "fim") {
      const turno = fim.historico.find((t) => t.papel === "ferramenta");
      expect(turno?.papel === "ferramenta" && turno.respostas[0]?.conteudo).toContain("erro");
    }
  });

  it("corta o loop no limite de iterações", async () => {
    // Modelo teimoso: pede ferramenta para sempre.
    const cliente = clienteFake(
      Array.from({ length: 20 }, () => ({ chamadas: [{ nome: "listar_transacoes" }] })),
    );

    const eventos = await coletar(
      conversarComAgente({ ...base, cliente, executarLeitura: async () => "{}", maxIteracoes: 3 }),
    );

    expect(cliente.vistos).toBe(3);
    expect(eventos.at(-1)).toMatchObject({ tipo: "erro" });
  });

  it("avisa quando o provedor não suporta conversa", async () => {
    const semConversa: ClienteModelo = { gerar: async () => "" };
    const eventos = await coletar(
      conversarComAgente({ ...base, cliente: semConversa, executarLeitura: async () => "{}" }),
    );
    expect(eventos).toEqual([
      { tipo: "erro", mensagem: "O provedor de IA configurado não suporta conversa." },
    ]);
  });
});

/**
 * Loop real contra o provedor — consome cota, então fica fora do `npm test`.
 * PowerShell: $env:IA_PING="1"; npm test
 *
 * Existe porque a classe de bug que este teste pega não aparece com mock: o
 * Gemini 3.x recusa (400) um `functionCall` reenviado sem a `thoughtSignature`
 * que ele mesmo emitiu, e só o round-trip real revela isso.
 */
describe.skipIf(process.env["IA_PING"] !== "1")("loop real de tool use", () => {
  const LINHAS: Record<string, unknown[]> = {
    transacoes: [
      { valor: 500, tipo: "DEBITO", categoria_id: "t1" },
      { valor: 380, tipo: "DEBITO", categoria_id: "t1" },
      { valor: 1240.5, tipo: "DEBITO", categoria_id: "a1" },
    ],
    categorias: [
      { id: "t1", nome: "Transporte" },
      { id: "a1", nome: "Alimentação" },
    ],
    contas: [{ id: "conta-1", nome: "Nubank", tipo: "CORRENTE" }],
  };

  function supabaseFalso() {
    return {
      from(tabela: string) {
        const resposta = { data: LINHAS[tabela] ?? [], error: null };
        const api: Record<string, unknown> = {
          select: () => api,
          order: () => api,
          limit: () => api,
          then: (r: (v: unknown) => unknown) => Promise.resolve(resposta).then(r),
        };
        for (const op of ["gte", "lt", "lte", "eq", "ilike", "is"]) api[op] = () => api;
        return api;
      },
    };
  }

  beforeAll(() => {
    for (const linha of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const corte = linha.indexOf("=");
      if (!linha.trim() || linha.trim().startsWith("#") || corte === -1) continue;
      const chave = linha.slice(0, corte).trim();
      if (process.env[chave]) continue;
      process.env[chave] = linha
        .slice(corte + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  });

  it("responde com o número real, não com um palpite", async () => {
    const { clientePadrao } = await import("@/lib/ai/modelo.server");
    const { capacidadePorNome, executarCapacidade } = await import("@/lib/capacidades");
    const ctx = { supabase: supabaseFalso(), userId: "u1" };

    let texto = "";
    for await (const evento of conversarComAgente({
      cliente: await clientePadrao(),
      system: montarSystemAgente(new Date("2026-08-07T12:00:00Z")),
      historico: [{ papel: "usuario", texto: "quanto gastei com transporte esse mês?" }],
      ferramentas: FERRAMENTAS_AGENTE,
      ehEscrita: (n) => !ehLeitura(n),
      descreverEscrita: (n, a) => capacidadePorNome(n)?.descreverAcao?.(a) ?? n,
      executarLeitura: async (c) => JSON.stringify(await executarCapacidade(c.nome, ctx, c.args)),
    })) {
      if (evento.tipo === "texto") texto += evento.conteudo;
    }

    expect(texto).toContain("880");
  }, 90_000);
});
