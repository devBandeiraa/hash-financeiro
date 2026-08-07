import { describe, expect, it } from "vitest";

import {
  agregarMes,
  impressaoAgregado,
  intervaloDoMes,
  mesAnteriorDe,
  montarPromptInsight,
  variacao,
  type LinhaAgregacao,
} from "@/lib/insights/agregar";

const NOMES = new Map([
  ["c1", "Alimentação"],
  ["c2", "Transporte"],
  ["c3", "Lazer"],
]);

const saida = (valor: number, categoriaId: string | null): LinhaAgregacao => ({
  valor,
  tipo: "DEBITO",
  categoriaId,
});
const entrada = (valor: number): LinhaAgregacao => ({
  valor,
  tipo: "CREDITO",
  categoriaId: null,
});

describe("mesAnteriorDe", () => {
  it("volta um mês, virando o ano", () => {
    expect(mesAnteriorDe("2026-08")).toBe("2026-07");
    expect(mesAnteriorDe("2026-01")).toBe("2025-12");
  });
});

describe("intervaloDoMes", () => {
  it("vai do dia 1 ao dia 1 do mês seguinte", () => {
    expect(intervaloDoMes("2026-08")).toEqual({ inicio: "2026-08-01", fim: "2026-09-01" });
    expect(intervaloDoMes("2026-12")).toEqual({ inicio: "2026-12-01", fim: "2027-01-01" });
  });
  it("cobre fevereiro sem depender de dias no mês", () => {
    expect(intervaloDoMes("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-03-01" });
  });
});

describe("variacao", () => {
  it("calcula percentual e arredonda", () => {
    expect(variacao(150, 100)).toBe(50);
    expect(variacao(50, 100)).toBe(-50);
    expect(variacao(100, 3)).toBe(3233.33);
  });
  it("devolve null sem base de comparação", () => {
    expect(variacao(100, 0)).toBeNull();
  });
});

describe("agregarMes", () => {
  const atual = [saida(300, "c1"), saida(100, "c1"), saida(200, "c2"), entrada(5000)];
  const anterior = [saida(200, "c1"), saida(400, "c2"), saida(50, "c3")];

  it("soma só saídas, ignorando entradas", () => {
    const r = agregarMes("2026-08", atual, anterior, NOMES);
    // 300 + 100 + 200 = 600; os 5000 de entrada não entram
    expect(r.totalSaidas).toBe(600);
    expect(r.totalSaidasAnterior).toBe(650);
  });

  it("agrupa por categoria e ordena por total", () => {
    const r = agregarMes("2026-08", atual, anterior, NOMES);
    expect(r.porCategoria).toEqual([
      { categoria: "Alimentação", total: 400, variacaoPct: 100 },
      { categoria: "Transporte", total: 200, variacaoPct: -50 },
    ]);
  });

  it("aponta categoria que sumiu em relação ao mês anterior", () => {
    const r = agregarMes("2026-08", atual, anterior, NOMES);
    expect(r.categoriasQueSumiram).toEqual(["Lazer"]);
  });

  it("trata transação sem categoria como 'Não categorizado'", () => {
    const r = agregarMes("2026-08", [saida(80, null)], [], NOMES);
    expect(r.porCategoria).toEqual([
      { categoria: "Não categorizado", total: 80, variacaoPct: null },
    ]);
  });

  it("não quebra em mês vazio", () => {
    const r = agregarMes("2026-08", [], [], NOMES);
    expect(r.totalSaidas).toBe(0);
    expect(r.variacaoTotalPct).toBeNull();
    expect(r.porCategoria).toEqual([]);
  });
});

describe("montarPromptInsight", () => {
  it("manda apenas agregados — nenhuma transação individual (LGPD)", () => {
    const agregado = agregarMes(
      "2026-08",
      [saida(89.9, "c1"), saida(42.5, "c2")],
      [saida(50, "c1")],
      NOMES,
    );
    const { user } = montarPromptInsight(agregado);
    const enviado = JSON.parse(user);

    // O payload é exatamente o agregado: nada de descrição, data ou conta.
    expect(Object.keys(enviado).sort()).toEqual([
      "categoriasQueSumiram",
      "mes",
      "mesAnterior",
      "porCategoria",
      "totalSaidas",
      "totalSaidasAnterior",
      "variacaoTotalPct",
    ]);
    expect(user).not.toContain("descricao");
    expect(user).not.toContain("conta");
  });

  it("proíbe markdown para o texto caber na UI", () => {
    const { system } = montarPromptInsight(agregarMes("2026-08", [], [], NOMES));
    expect(system).toMatch(/markdown/i);
  });
});

describe("impressaoAgregado", () => {
  it("é estável para os mesmos números", async () => {
    const a = agregarMes("2026-08", [saida(100, "c1")], [], NOMES);
    const b = agregarMes("2026-08", [saida(100, "c1")], [], NOMES);
    expect(await impressaoAgregado(a)).toBe(await impressaoAgregado(b));
  });

  it("muda quando os números mudam — é o que invalida o cache", async () => {
    const a = agregarMes("2026-08", [saida(100, "c1")], [], NOMES);
    const b = agregarMes("2026-08", [saida(101, "c1")], [], NOMES);
    expect(await impressaoAgregado(a)).not.toBe(await impressaoAgregado(b));
  });
});
