import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import {
  chamarModelo,
  IaIndisponivelError,
  parseJsonSeguro,
  type ClienteModelo,
  type PedidoModelo,
} from "@/lib/ai/modelo.server";
import {
  CATEGORIA_INCERTA,
  interpretarResposta,
  montarPrompt,
  sugerirCategorias,
} from "@/lib/categorize/ai/sugerir.server";
import { extrairPalavraChave } from "@/lib/categorize/ai/palavra-chave";

const PEDIDO: PedidoModelo = { system: "s", user: "u" };

/** Cliente falso que devolve/lança o que a fila mandar, contando as chamadas. */
function clienteFake(respostas: Array<string | Error>) {
  let chamadas = 0;
  const cliente: ClienteModelo = {
    async gerar() {
      const r = respostas[chamadas];
      chamadas += 1;
      if (r instanceof Error) throw r;
      return r ?? "";
    },
  };
  return { cliente, chamadas: () => chamadas };
}

const transitorio = () => Object.assign(new Error("x"), { name: "TimeoutError" });
const permanente = () => Object.assign(new Error("x"), { name: "BadRequestError" });
const semEspera = { esperaBaseMs: 0, dormir: async () => {} };

describe("parseJsonSeguro", () => {
  it("aceita JSON limpo", () => {
    expect(parseJsonSeguro('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonSeguro('[{"descricao":"IFOOD","categoria":"Alimentação"}]')).toEqual([
      { descricao: "IFOOD", categoria: "Alimentação" },
    ]);
  });

  it("remove cerca de markdown", () => {
    expect(parseJsonSeguro('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonSeguro("```\n[1,2]\n```")).toEqual([1, 2]);
  });

  it("recorta texto antes e depois do JSON", () => {
    expect(parseJsonSeguro('Claro! Aqui está:\n[{"a":1}]\nEspero ter ajudado.')).toEqual([
      { a: 1 },
    ]);
  });

  it("não se perde com chave dentro de string", () => {
    expect(parseJsonSeguro('lixo {"d":"POSTO } SHELL"} lixo')).toEqual({
      d: "POSTO } SHELL",
    });
  });

  it("devolve null em JSON quebrado, sem lançar", () => {
    expect(parseJsonSeguro('[{"descricao": "IFOOD",')).toBeNull();
    expect(parseJsonSeguro("desculpe, não consigo")).toBeNull();
    expect(parseJsonSeguro("")).toBeNull();
  });
});

describe("chamarModelo", () => {
  it("devolve o texto do modelo já normalizado", async () => {
    const { cliente } = clienteFake(["  ok  "]);
    await expect(chamarModelo(PEDIDO, { cliente, ...semEspera })).resolves.toBe("ok");
  });

  it("repete em falha transitória e devolve o sucesso seguinte", async () => {
    const f = clienteFake([transitorio(), transitorio(), "ok"]);
    await expect(chamarModelo(PEDIDO, { cliente: f.cliente, ...semEspera })).resolves.toBe("ok");
    expect(f.chamadas()).toBe(3);
  });

  it("não repete em erro permanente", async () => {
    const f = clienteFake([permanente(), "ok"]);
    await expect(chamarModelo(PEDIDO, { cliente: f.cliente, ...semEspera })).rejects.toBeInstanceOf(
      IaIndisponivelError,
    );
    expect(f.chamadas()).toBe(1);
  });

  it("respeita o limite de tentativas", async () => {
    const f = clienteFake([transitorio(), transitorio(), transitorio()]);
    await expect(
      chamarModelo(PEDIDO, { cliente: f.cliente, tentativas: 2, ...semEspera }),
    ).rejects.toBeInstanceOf(IaIndisponivelError);
    expect(f.chamadas()).toBe(2);
  });

  it("trata resposta vazia como indisponibilidade", async () => {
    const { cliente } = clienteFake(["   "]);
    await expect(chamarModelo(PEDIDO, { cliente, ...semEspera })).rejects.toBeInstanceOf(
      IaIndisponivelError,
    );
  });

  it("aborta por timeout e desiste depois das tentativas", async () => {
    const lento: ClienteModelo = {
      gerar: (_p, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("abort"), { name: "TimeoutError" })),
          );
        }),
    };
    await expect(
      chamarModelo(PEDIDO, { cliente: lento, timeoutMs: 5, tentativas: 2, ...semEspera }),
    ).rejects.toBeInstanceOf(IaIndisponivelError);
  });

  it("nunca vaza o erro cru do SDK para o chamador", async () => {
    const { cliente } = clienteFake([new Error("payload: IFOOD *REST SP R$ 89,90")]);
    await expect(chamarModelo(PEDIDO, { cliente, ...semEspera })).rejects.toThrow(
      /IA indisponível: Error$/,
    );
  });
});

const CATEGORIAS = ["Alimentação", "Transporte", "Moradia", CATEGORIA_INCERTA];
const DESCRICOES = ["IFOOD *REST SP", "UBER *TRIP", "POSTO SHELL 24H"];

describe("montarPrompt", () => {
  it("lista as categorias no system e só descrições no user", () => {
    const { system, user } = montarPrompt(DESCRICOES, CATEGORIAS);
    expect(system).toContain("Alimentação, Transporte, Moradia");
    expect(user).toBe("IFOOD *REST SP\nUBER *TRIP\nPOSTO SHELL 24H");
  });

  it("não deixa vazar nada além da descrição (LGPD)", () => {
    const { user } = montarPrompt(["IFOOD *REST SP"], CATEGORIAS);
    // valor, data, saldo, conta e id não têm como aparecer: não entram na função
    expect(user).toBe("IFOOD *REST SP");
  });
});

describe("interpretarResposta", () => {
  const resposta = (sugestoes: unknown) => JSON.stringify({ sugestoes });

  it("converte o exemplo do apêndice B", () => {
    const texto = resposta([
      { descricao: "IFOOD *REST SP", categoria: "Alimentação" },
      { descricao: "UBER *TRIP", categoria: "Transporte" },
      { descricao: "POSTO SHELL 24H", categoria: "Transporte" },
    ]);
    expect(interpretarResposta(texto, DESCRICOES, CATEGORIAS)).toEqual([
      { descricao: "IFOOD *REST SP", categoria: "Alimentação" },
      { descricao: "UBER *TRIP", categoria: "Transporte" },
      { descricao: "POSTO SHELL 24H", categoria: "Transporte" },
    ]);
  });

  it("aceita array cru e ignora caixa/acento na categoria", () => {
    const texto = JSON.stringify([{ descricao: "ifood *rest sp", categoria: "ALIMENTACAO" }]);
    expect(interpretarResposta(texto, DESCRICOES, CATEGORIAS)).toEqual([
      { descricao: "IFOOD *REST SP", categoria: "Alimentação" },
    ]);
  });

  it("descarta categoria inventada fora da lista", () => {
    const texto = resposta([{ descricao: "IFOOD *REST SP", categoria: "Delivery" }]);
    expect(interpretarResposta(texto, DESCRICOES, CATEGORIAS)).toEqual([]);
  });

  it("descarta descrição que não foi enviada", () => {
    const texto = resposta([{ descricao: "NETFLIX.COM", categoria: "Alimentação" }]);
    expect(interpretarResposta(texto, DESCRICOES, CATEGORIAS)).toEqual([]);
  });

  it("descarta o escape de incerteza — não vira sugestão nem regra", () => {
    const texto = resposta([
      { descricao: "IFOOD *REST SP", categoria: CATEGORIA_INCERTA },
      { descricao: "UBER *TRIP", categoria: "Transporte" },
    ]);
    expect(interpretarResposta(texto, DESCRICOES, CATEGORIAS)).toEqual([
      { descricao: "UBER *TRIP", categoria: "Transporte" },
    ]);
  });

  it("mantém só a primeira resposta de uma descrição repetida", () => {
    const texto = resposta([
      { descricao: "UBER *TRIP", categoria: "Transporte" },
      { descricao: "UBER *TRIP", categoria: "Moradia" },
    ]);
    expect(interpretarResposta(texto, DESCRICOES, CATEGORIAS)).toEqual([
      { descricao: "UBER *TRIP", categoria: "Transporte" },
    ]);
  });

  it("devolve vazio em JSON quebrado ou fora do formato", () => {
    expect(interpretarResposta('[{"descricao":', DESCRICOES, CATEGORIAS)).toEqual([]);
    expect(interpretarResposta("não consigo ajudar", DESCRICOES, CATEGORIAS)).toEqual([]);
    expect(interpretarResposta(resposta("nada disso"), DESCRICOES, CATEGORIAS)).toEqual([]);
  });
});

describe("sugerirCategorias", () => {
  it("quebra em lotes e junta o resultado", async () => {
    const recebidos: string[] = [];
    const chamar = async (p: PedidoModelo) => {
      recebidos.push(p.user);
      const linhas = p.user.split("\n");
      return JSON.stringify({
        sugestoes: linhas.map((descricao) => ({ descricao, categoria: "Transporte" })),
      });
    };

    const r = await sugerirCategorias(DESCRICOES, CATEGORIAS, { chamar, tamanhoLote: 2 });
    expect(recebidos).toHaveLength(2);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ descricao: "IFOOD *REST SP", categoria: "Transporte" });
  });

  it("manda descrições distintas, sem repetir nem vazio", async () => {
    let enviado = "";
    const chamar = async (p: PedidoModelo) => {
      enviado = p.user;
      return JSON.stringify({ sugestoes: [] });
    };
    await sugerirCategorias(["UBER", "UBER", "  ", "IFOOD"], CATEGORIAS, { chamar });
    expect(enviado).toBe("UBER\nIFOOD");
  });

  it("não chama o modelo sem descrição ou sem categoria", async () => {
    let chamadas = 0;
    const chamar = async () => {
      chamadas += 1;
      return "";
    };
    expect(await sugerirCategorias([], CATEGORIAS, { chamar })).toEqual([]);
    expect(await sugerirCategorias(DESCRICOES, [], { chamar })).toEqual([]);
    expect(chamadas).toBe(0);
  });

  it("um lote ilegível não derruba os outros", async () => {
    let n = 0;
    const chamar = async (p: PedidoModelo) => {
      n += 1;
      if (n === 1) return "desculpe, não consigo";
      return JSON.stringify({
        sugestoes: [{ descricao: p.user, categoria: "Transporte" }],
      });
    };
    const r = await sugerirCategorias(DESCRICOES, CATEGORIAS, { chamar, tamanhoLote: 1 });
    expect(r).toEqual([
      { descricao: "UBER *TRIP", categoria: "Transporte" },
      { descricao: "POSTO SHELL 24H", categoria: "Transporte" },
    ]);
  });

  it("propaga a indisponibilidade só quando todos os lotes falham", async () => {
    const sempreFora = async () => {
      throw new IaIndisponivelError("teste");
    };
    await expect(
      sugerirCategorias(DESCRICOES, CATEGORIAS, { chamar: sempreFora, tamanhoLote: 1 }),
    ).rejects.toBeInstanceOf(IaIndisponivelError);

    let n = 0;
    const meioFora = async (p: PedidoModelo) => {
      n += 1;
      if (n === 1) throw new IaIndisponivelError("teste");
      return JSON.stringify({ sugestoes: [{ descricao: p.user, categoria: "Moradia" }] });
    };
    const r = await sugerirCategorias(DESCRICOES, CATEGORIAS, {
      chamar: meioFora,
      tamanhoLote: 1,
    });
    expect(r).toHaveLength(2);
  });
});

describe("extrairPalavraChave", () => {
  it("acha o estabelecimento no meio do ruído bancário", () => {
    expect(extrairPalavraChave("IFOOD *REST SP")).toBe("IFOOD");
    expect(extrairPalavraChave("PAG*BarbeariaDoZe")).toBe("BARBEARIADOZE");
    expect(extrairPalavraChave("DROGASIL 1234")).toBe("DROGASIL");
    expect(extrairPalavraChave("NETFLIX.COM")).toBe("NETFLIX");
  });

  it("normaliza acento e caixa como o motor de regras espera", () => {
    expect(extrairPalavraChave("Farmácia São João")).toBe("FARMACIA");
  });

  it("descarta número puro e ruído de operação", () => {
    expect(extrairPalavraChave("PIX ENVIADO 99887766")).toBeNull();
    expect(extrairPalavraChave("TARIFA 001")).toBeNull();
    expect(extrairPalavraChave("12345 6789")).toBeNull();
  });

  it("cola o token curto no seguinte em vez de virar regra ampla demais", () => {
    // "TIM" sozinho casaria com TIMES, TIMAO, MULTIMIDIA...
    expect(extrairPalavraChave("TIM SP CELULAR")).toBe("TIM CELULAR");
  });

  it("devolve null quando não sobra âncora nenhuma", () => {
    expect(extrairPalavraChave("")).toBeNull();
    expect(extrairPalavraChave("*** 123 ***")).toBeNull();
  });
});

/**
 * Carrega o `.env` para dentro de `process.env`. O Vite só injeta `VITE_*`, e
 * as chaves de IA são de servidor — sem isso o ping não enxergaria a chave.
 * Não sobrescreve o que já veio do ambiente.
 */
function carregarEnv(): void {
  let bruto: string;
  try {
    bruto = readFileSync(".env", "utf8");
  } catch {
    return; // sem .env local: o ambiente que mande
  }
  for (const linha of bruto.split(/\r?\n/)) {
    const corte = linha.indexOf("=");
    if (!linha.trim() || linha.trim().startsWith("#") || corte === -1) continue;
    const chave = linha.slice(0, corte).trim();
    if (process.env[chave]) continue;
    process.env[chave] = linha
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

/**
 * Ping real contra a API — consome cota, então fica fora do `npm test` padrão.
 * PowerShell: $env:IA_PING="1"; npm test   (a chave vem do .env)
 */
describe.skipIf(process.env["IA_PING"] !== "1")("ping real do modelo", () => {
  beforeAll(() => carregarEnv());

  it("responde a um prompt trivial", async () => {
    const texto = await chamarModelo({
      system: "Responda apenas com a palavra PONG, sem pontuação.",
      user: "ping",
      esforco: "baixo",
      maxTokens: 2000,
    });
    expect(texto.toUpperCase()).toContain("PONG");
  }, 60_000);

  it("respeita a saída estruturada com o esquema do serviço", async () => {
    const r = await sugerirCategorias(
      ["IFOOD *REST SP", "UBER *TRIP"],
      ["Alimentação", "Transporte", CATEGORIA_INCERTA],
    );
    expect(r).toEqual([
      { descricao: "IFOOD *REST SP", categoria: "Alimentação" },
      { descricao: "UBER *TRIP", categoria: "Transporte" },
    ]);
  }, 60_000);
});
