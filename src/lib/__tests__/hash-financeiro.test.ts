import { describe, expect, it } from "vitest";

import {
  normalizarData,
  normalizarDescricao,
  normalizarLinha,
  normalizarValor,
} from "@/lib/import/normalize";
import { detectarSeparador, mapearColunas, parseCsv, parseLinhaCsv } from "@/lib/import/csv.parser";
import { parsePdfTexto } from "@/lib/import/pdf.parser";
import { calcularHashDedupe } from "@/lib/import/dedupe";
import { categorizar } from "@/lib/categorize/engine";
import type { RegraCategorizacao } from "@/lib/types/dominio";

describe("normalizarData", () => {
  it("aceita formato brasileiro e ISO", () => {
    expect(normalizarData("31/07/2026")).toBe("2026-07-31");
    expect(normalizarData("2026-07-31")).toBe("2026-07-31");
    expect(normalizarData("1/2/26")).toBe("2026-02-01");
    expect(normalizarData("20260731120000")).toBe("2026-07-31");
  });
  it("rejeita data impossível", () => {
    expect(normalizarData("31/02/2026")).toBeNull();
    expect(normalizarData("banana")).toBeNull();
  });
});

describe("normalizarValor", () => {
  it("entende milhar/decimal brasileiro e americano", () => {
    expect(normalizarValor("1.234,56")).toEqual({ valor: 1234.56, tipo: "CREDITO" });
    expect(normalizarValor("-1234.56")).toEqual({ valor: 1234.56, tipo: "DEBITO" });
    expect(normalizarValor("R$ 89,90")).toEqual({ valor: 89.9, tipo: "CREDITO" });
    expect(normalizarValor("(50,00)")).toEqual({ valor: 50, tipo: "DEBITO" });
  });
  it("rejeita valor inválido", () => {
    expect(normalizarValor("abc")).toBeNull();
  });
});

describe("normalizarDescricao", () => {
  it("remove acento, pontuação e caixa", () => {
    expect(normalizarDescricao("Padaria São José - 12/07")).toBe("PADARIA SAO JOSE 12 07");
  });
});

describe("normalizarLinha", () => {
  it("usa a coluna de tipo quando existe", () => {
    const r = normalizarLinha({
      data: "01/07/2026",
      descricao: "IFOOD",
      valor: "50,00",
      tipo: "D",
    });
    expect(r).toEqual({
      ok: true,
      linha: { data: "2026-07-01", descricao: "IFOOD", valor: 50, tipo: "DEBITO" },
    });
  });
  it("reporta motivo em linha inválida", () => {
    expect(normalizarLinha({ data: "x", descricao: "a", valor: "1" })).toEqual({
      ok: false,
      motivo: "data inválida",
    });
  });
});

describe("csv", () => {
  it("detecta separador e mapeia colunas por sinônimo", () => {
    expect(detectarSeparador("data;historico;valor")).toBe(";");
    expect(mapearColunas(["Data", "Histórico", "Valor"])).toEqual({
      data: 0,
      descricao: 1,
      valor: 2,
      tipo: null,
    });
  });

  it("respeita aspas com separador dentro", () => {
    expect(parseLinhaCsv('01/07/2026;"MERCADO; LTDA";-10,00', ";")).toEqual([
      "01/07/2026",
      "MERCADO; LTDA",
      "-10,00",
    ]);
  });

  it("parseia extrato com linhas boas e ruins", () => {
    const csv = [
      "Data;Historico;Valor",
      "01/07/2026;IFOOD *PEDIDO;-52,30",
      "02/07/2026;SALARIO;5.000,00",
      "data-ruim;QUALQUER;10,00",
    ].join("\n");
    const { linhas, invalidas } = parseCsv(csv);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({
      data: "2026-07-01",
      descricao: "IFOOD *PEDIDO",
      valor: 52.3,
      tipo: "DEBITO",
    });
    expect(invalidas).toEqual([{ linha: 4, motivo: "data inválida" }]);
  });

  it("falha quando o cabeçalho não tem as colunas mínimas", () => {
    expect(() => parseCsv("a;b;c\n1;2;3")).toThrow();
  });
});

describe("pdf", () => {
  it("extrai lançamentos do texto de um extrato", () => {
    const texto = `
Banco Exemplo — Extrato de conta corrente
Período: 01/07/2026 a 31/07/2026
03/07/2026  UBER TRIP SAO PAULO        -120,45
05/07/2026  PIX RECEBIDO JOAO         1.500,00
Saldo em 31/07/2026                   2.379,55`;
    const { linhas, invalidas } = parsePdfTexto(texto);
    expect(invalidas).toHaveLength(0);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({
      data: "2026-07-03",
      descricao: "UBER TRIP SAO PAULO",
      valor: 120.45,
      tipo: "DEBITO",
    });
    expect(linhas[1]?.tipo).toBe("CREDITO");
  });

  it("descarta cabeçalho, rodapé e linha de saldo", () => {
    const texto = `
Extrato consolidado — página 1 de 2
Agência 0001 Conta 12345-6
10/07/2026  MERCADO LIVRE      -89,90
Total do período                    -89,90
Saldo disponível                  1.000,00`;
    const { linhas } = parsePdfTexto(texto);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.descricao).toBe("MERCADO LIVRE");
  });

  it("usa sufixo D/C do banco e infere o ano quando a data vem sem ele", () => {
    const texto = `
Extrato 2026
12/08  TARIFA MENSALIDADE      35,00 D
15/08  RENDIMENTO POUPANCA      4,21 C`;
    const { linhas } = parsePdfTexto(texto);
    expect(linhas[0]).toEqual({
      data: "2026-08-12",
      descricao: "TARIFA MENSALIDADE",
      valor: 35,
      tipo: "DEBITO",
    });
    expect(linhas[1]?.tipo).toBe("CREDITO");
  });

  it("avisa quando o PDF não tem lançamento reconhecível (ex.: digitalizado)", () => {
    expect(() => parsePdfTexto("imagem sem texto util")).toThrow(/digitalizado|Nenhum lançamento/i);
  });
});

describe("dedupe", () => {
  const base = {
    usuarioId: "u1",
    contaId: "c1",
    data: "2026-07-01",
    valor: 52.3,
    tipo: "DEBITO" as const,
    descricao: "IFOOD *PEDIDO",
  };

  it("é determinístico e ignora ruído da descrição", async () => {
    const a = await calcularHashDedupe(base);
    const b = await calcularHashDedupe({ ...base, descricao: "ifood  pedido" });
    expect(a).toBe(b);
  });

  it("muda quando muda o valor ou o usuário", async () => {
    const a = await calcularHashDedupe(base);
    expect(await calcularHashDedupe({ ...base, valor: 52.31 })).not.toBe(a);
    expect(await calcularHashDedupe({ ...base, usuarioId: "u2" })).not.toBe(a);
  });
});

describe("categorizar", () => {
  const regra = (over: Partial<RegraCategorizacao>): RegraCategorizacao => ({
    id: crypto.randomUUID(),
    usuarioId: null,
    palavraChave: "IFOOD",
    categoriaId: "cat-alimentacao",
    prioridade: 100,
    ativa: true,
    ...over,
  });

  it("casa por palavra-chave ignorando acento e caixa", () => {
    expect(categorizar("Ifood *pedido 123", [regra({})])).toBe("cat-alimentacao");
  });

  it("regra do usuário vence a do sistema", () => {
    const regras = [
      regra({ usuarioId: null, categoriaId: "sistema", prioridade: 1 }),
      regra({ usuarioId: "u1", categoriaId: "minha", prioridade: 500 }),
    ];
    expect(categorizar("IFOOD", regras)).toBe("minha");
  });

  it("ignora regra inativa e devolve null sem match", () => {
    expect(categorizar("IFOOD", [regra({ ativa: false })])).toBeNull();
    expect(categorizar("LOJA DESCONHECIDA", [regra({})])).toBeNull();
  });
});
