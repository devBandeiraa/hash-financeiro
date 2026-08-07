import { describe, expect, it } from "vitest";

import {
  CAPACIDADES,
  capacidadePorNome,
  executarCapacidade,
  resumoDashboard,
} from "@/lib/capacidades";
import { FERRAMENTAS_AGENTE, ehLeitura, ferramentaPorNome } from "@/lib/agente/ferramentas";

/** Duplo encadeável do Supabase: devolve linhas fixas por tabela. */
function supabaseFalso(linhas: Record<string, unknown[]>) {
  const chamadas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];

  function builder(tabela: string) {
    const registro = { tabela, filtros: [] as Array<[string, unknown]> };
    chamadas.push(registro);

    const resposta = { data: linhas[tabela] ?? [], error: null };
    const api: Record<string, unknown> = {
      select: () => api,
      order: () => api,
      limit: () => api,
      insert: () => api,
      update: () => api,
      single: () => Promise.resolve({ data: (linhas[tabela] ?? [])[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: (linhas[tabela] ?? [])[0] ?? null, error: null }),
      then: (r: (v: unknown) => unknown) => Promise.resolve(resposta).then(r),
    };
    for (const op of ["gte", "lt", "lte", "eq", "ilike", "is"]) {
      api[op] = (coluna: string, valor: unknown) => {
        registro.filtros.push([`${op}:${coluna}`, valor]);
        return api;
      };
    }
    return api;
  }

  return { supabase: { from: builder }, chamadas };
}

const CTX = (linhas: Record<string, unknown[]>) => {
  const { supabase, chamadas } = supabaseFalso(linhas);
  return { ctx: { supabase, userId: "user-1" }, chamadas };
};

describe("catálogo de capacidades", () => {
  it("expõe as 7 capacidades com nomes únicos", () => {
    const nomes = CAPACIDADES.map((c) => c.nome);
    expect(nomes).toHaveLength(7);
    expect(new Set(nomes).size).toBe(7);
  });

  it("separa leitura de escrita — é o que a confirmação da Fase B3 usa", () => {
    const escrita = CAPACIDADES.filter((c) => c.natureza === "escrita").map((c) => c.nome);
    expect(escrita.sort()).toEqual(["categorizar_transacao", "criar_regra", "criar_transacao"]);
  });

  it("toda capacidade de escrita sabe se descrever para o usuário confirmar", () => {
    for (const c of CAPACIDADES.filter((x) => x.natureza === "escrita")) {
      expect(typeof c.descreverAcao).toBe("function");
    }
  });

  it("nenhuma capacidade aceita usuarioId por argumento", () => {
    // O userId vem do contexto autenticado. Se algum dia entrar no schema, o
    // modelo poderia escolher de quem é o dado — este teste é a trava.
    for (const c of CAPACIDADES) {
      const campos = Object.keys(c.entrada).map((k) => k.toLowerCase());
      expect(campos).not.toContain("usuarioid");
      expect(campos).not.toContain("usuario_id");
      expect(campos).not.toContain("userid");
    }
  });
});

describe("executarCapacidade", () => {
  it("recusa ferramenta desconhecida", async () => {
    const { ctx } = CTX({});
    await expect(executarCapacidade("apagar_tudo", ctx, {})).rejects.toThrow(/desconhecida/);
  });

  it("valida os argumentos antes de tocar o banco", async () => {
    const { ctx, chamadas } = CTX({});
    await expect(
      executarCapacidade("criar_transacao", ctx, { contaId: "nao-e-uuid" }),
    ).rejects.toThrow(/Argumentos inválidos/);
    expect(chamadas).toHaveLength(0);
  });

  it("aceita chamada sem argumentos quando o schema é vazio", async () => {
    const { ctx } = CTX({ contas: [{ id: "c1" }], categorias: [{ id: "k1" }] });
    await expect(executarCapacidade("listar_contas_categorias", ctx, undefined)).resolves.toEqual({
      contas: [{ id: "c1" }],
      categorias: [{ id: "k1" }],
    });
  });
});

describe("resumoDashboard", () => {
  it("separa entradas de saídas e agrupa por categoria", async () => {
    const { ctx } = CTX({
      transacoes: [
        { valor: 100, tipo: "DEBITO", categoria_id: "c1" },
        { valor: 50, tipo: "DEBITO", categoria_id: "c1" },
        { valor: 30, tipo: "DEBITO", categoria_id: null },
        { valor: 5000, tipo: "CREDITO", categoria_id: null },
      ],
      categorias: [{ id: "c1", nome: "Alimentação" }],
    });

    const r = (await resumoDashboard.executar(ctx, { mes: "2026-08" })) as {
      entradas: number;
      saidas: number;
      saldo: number;
      gastosPorCategoria: Array<{ categoria: string; total: number }>;
    };

    expect(r.entradas).toBe(5000);
    expect(r.saidas).toBe(180);
    expect(r.saldo).toBe(4820);
    expect(r.gastosPorCategoria).toEqual([
      { categoria: "Alimentação", total: 150 },
      { categoria: "Sem categoria", total: 30 },
    ]);
  });

  it("consulta o mês pelo primeiro dia do mês seguinte, não por 30/31", async () => {
    const { ctx, chamadas } = CTX({ transacoes: [], categorias: [] });
    await resumoDashboard.executar(ctx, { mes: "2026-02" });

    const filtros = chamadas.find((c) => c.tabela === "transacoes")?.filtros ?? [];
    expect(filtros).toContainEqual(["gte:data", "2026-02-01"]);
    expect(filtros).toContainEqual(["lt:data", "2026-03-01"]);
  });
});

describe("ferramentas do agente", () => {
  it("espelha o catálogo de capacidades", () => {
    expect(FERRAMENTAS_AGENTE.map((f) => f.nome).sort()).toEqual(
      CAPACIDADES.map((c) => c.nome).sort(),
    );
  });

  it("marca escrita como exigindo confirmação", () => {
    expect(ferramentaPorNome("criar_transacao")?.exigeConfirmacao).toBe(true);
    expect(ferramentaPorNome("resumo_dashboard")?.exigeConfirmacao).toBe(false);
    expect(ehLeitura("criar_regra")).toBe(false);
    expect(ehLeitura("listar_transacoes")).toBe(true);
  });

  it("ferramenta inexistente não conta como leitura", () => {
    expect(ehLeitura("apagar_tudo")).toBe(false);
  });

  it("gera schema utilizável para o provedor", () => {
    const f = ferramentaPorNome("listar_transacoes");
    expect(f?.esquema.safeParse({ limite: 10 }).success).toBe(true);
    expect(f?.esquema.safeParse({ limite: 9999 }).success).toBe(false);
  });
});

describe("compatibilidade com o servidor MCP", () => {
  it("mantém os nomes que clientes MCP externos já usam", () => {
    // Renomear qualquer um destes quebra integrações de terceiros.
    for (const nome of [
      "listar_contas_categorias",
      "resumo_dashboard",
      "listar_transacoes",
      "criar_transacao",
      "categorizar_transacao",
    ]) {
      expect(capacidadePorNome(nome)).toBeDefined();
    }
  });
});

describe("procedência das escritas feitas por modelo", () => {
  /** Captura o payload enviado ao insert/update. */
  function espiao(linhas: Record<string, unknown[]> = {}) {
    const payloads: Array<{ tabela: string; valores: Record<string, unknown> }> = [];
    function builder(tabela: string) {
      const api: Record<string, unknown> = {
        select: () => api,
        order: () => api,
        limit: () => api,
        single: () => Promise.resolve({ data: { id: "novo" }, error: null }),
        maybeSingle: () =>
          Promise.resolve({ data: (linhas[tabela] ?? [{ id: "achado" }])[0], error: null }),
        insert: (valores: Record<string, unknown>) => {
          payloads.push({ tabela, valores });
          return api;
        },
        update: (valores: Record<string, unknown>) => {
          payloads.push({ tabela, valores });
          return api;
        },
        then: (r: (v: unknown) => unknown) =>
          Promise.resolve({ data: linhas[tabela] ?? [], error: null }).then(r),
      };
      for (const op of ["gte", "lt", "lte", "eq", "ilike", "is"]) api[op] = () => api;
      return api;
    }
    return { supabase: { from: builder }, payloads };
  }

  it("regra criada pelo agente nasce com origem 'ia'", async () => {
    const { supabase, payloads } = espiao();
    await executarCapacidade(
      "criar_regra",
      { supabase, userId: "u1" },
      { palavraChave: "uber", categoriaId: "11111111-0000-4000-8000-000000000002" },
    );
    const regra = payloads.find((p) => p.tabela === "regras_categorizacao");
    expect(regra?.valores).toMatchObject({ origem: "ia", palavra_chave: "UBER" });
  });

  it("recategorização feita pelo agente marca 'ia', não 'usuario'", async () => {
    const { supabase, payloads } = espiao();
    await executarCapacidade(
      "categorizar_transacao",
      { supabase, userId: "u1" },
      {
        transacaoId: "22222222-0000-4000-8000-000000000001",
        categoriaId: "11111111-0000-4000-8000-000000000002",
      },
    );
    expect(payloads[0]?.valores).toMatchObject({ categoria_origem: "ia" });
  });

  it("transação criada sem categoria não finge procedência de IA", async () => {
    const { supabase, payloads } = espiao();
    await executarCapacidade(
      "criar_transacao",
      { supabase, userId: "u1" },
      {
        contaId: "33333333-0000-4000-8000-000000000001",
        data: "2026-08-07",
        descricao: "PADARIA",
        valor: 12.5,
        tipo: "DEBITO",
      },
    );
    const t = payloads.find((p) => p.tabela === "transacoes");
    expect(t?.valores).toMatchObject({ categoria_origem: "sistema", origem: "MANUAL" });
  });
});

describe("frase de confirmação (é o que o usuário lê antes de clicar)", () => {
  const nomeDe = (id: string) => ({ "cat-transporte": "Transporte", "conta-1": "Nubank" })[id];

  it("mostra o nome da categoria, não o UUID", () => {
    const criarRegra = capacidadePorNome("criar_regra");
    expect(
      criarRegra?.descreverAcao?.({ palavraChave: "uber", categoriaId: "cat-transporte" }, nomeDe),
    ).toBe('Criar regra: descrições com "UBER" → Transporte');
  });

  it("descreve valor, tipo e data ao criar transação", () => {
    const criar = capacidadePorNome("criar_transacao");
    expect(
      criar?.descreverAcao?.(
        {
          contaId: "conta-1",
          data: "2026-08-07",
          descricao: "PADARIA",
          valor: 12.5,
          tipo: "DEBITO",
          categoriaId: "cat-transporte",
        },
        nomeDe,
      ),
    ).toBe('Criar saída de R$ 12.50 em 2026-08-07: "PADARIA" em Transporte');
  });

  it("degrada sem quebrar quando o nome não resolve", () => {
    const criarRegra = capacidadePorNome("criar_regra");
    expect(
      criarRegra?.descreverAcao?.({ palavraChave: "uber", categoriaId: "desconhecida" }),
    ).toContain("categoria");
  });
});
