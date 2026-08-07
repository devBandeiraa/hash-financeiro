import { describe, expect, it } from "vitest";

import { aplicarSugestoes, PRIORIDADE_REGRA_IA } from "@/lib/categorize/ai/aplicar";

/** Chamada registrada contra o Supabase falso. */
interface Op {
  tabela: string;
  verbo: "select" | "update" | "insert";
  payload?: Record<string, unknown>;
  filtros: Array<[string, string, unknown]>;
}

interface Cenario {
  /** Categorias que a RLS deixa o usuário enxergar. */
  categorias?: string[];
  /** Quantas transações cada `update` afeta, por descrição. */
  afetadasPorDescricao?: Record<string, number>;
  /** Palavras-chave que já têm regra do usuário. */
  regrasExistentes?: string[];
  erroNoUpdateDeTransacoes?: boolean;
}

/**
 * Duplo do client do Supabase: encadeia como o de verdade e grava tudo que
 * recebe, para o teste afirmar sobre os filtros — que é onde mora a segurança
 * (`is categoria_id null`, escopo por palavra-chave).
 */
function supabaseFalso(cenario: Cenario = {}) {
  const ops: Op[] = [];
  const categorias = cenario.categorias ?? ["cat-saude", "cat-servicos"];
  const regrasExistentes = new Set(cenario.regrasExistentes ?? []);

  function builder(tabela: string) {
    const op: Op = { tabela, verbo: "select", filtros: [] };
    let payload: Record<string, unknown> | undefined;

    const api: Record<string, unknown> = {
      select() {
        if (op.verbo === "select") ops.push(op);
        // update().select() resolve com as linhas afetadas
        if (op.verbo === "update" && tabela === "transacoes") {
          const descricao = op.filtros.find(([c, o]) => c === "descricao" && o === "eq")?.[2];
          if (cenario.erroNoUpdateDeTransacoes) {
            return Promise.resolve({ data: null, error: { message: "falhou" } });
          }
          const n = cenario.afetadasPorDescricao?.[String(descricao)] ?? 0;
          return Promise.resolve({
            data: Array.from({ length: n }, (_, i) => ({ id: `t${i}` })),
            error: null,
          });
        }
        if (tabela === "categorias") {
          return Promise.resolve({ data: categorias.map((id) => ({ id })), error: null });
        }
        return api;
      },
      update(p: Record<string, unknown>) {
        op.verbo = "update";
        payload = p;
        op.payload = p;
        ops.push(op);
        return api;
      },
      insert(p: Record<string, unknown>) {
        op.verbo = "insert";
        op.payload = p;
        ops.push(op);
        return Promise.resolve({ data: null, error: null });
      },
      eq(coluna: string, valor: unknown) {
        op.filtros.push([coluna, "eq", valor]);
        // update().eq() sem .select() encerra a cadeia
        if (op.verbo === "update" && tabela === "regras_categorizacao") {
          return Promise.resolve({ data: null, error: null });
        }
        return api;
      },
      is(coluna: string, valor: unknown) {
        op.filtros.push([coluna, "is", valor]);
        return api;
      },
      maybeSingle() {
        const chave = op.filtros.find(([c]) => c === "palavra_chave")?.[2];
        return Promise.resolve({
          data: regrasExistentes.has(String(chave)) ? { id: `regra-${String(chave)}` } : null,
          error: null,
        });
      },
    };
    void payload;
    return api;
  }

  return { supabase: { from: builder }, ops };
}

const USER = "user-1";

describe("aplicarSugestoes", () => {
  it("categoriza e cria a regra correspondente", async () => {
    const { supabase, ops } = supabaseFalso({
      afetadasPorDescricao: { "DROGASIL 1234": 3 },
    });

    const r = await aplicarSugestoes(supabase, USER, [
      { descricao: "DROGASIL 1234", categoriaId: "cat-saude", criarRegra: true },
    ]);

    expect(r).toEqual({ transacoesAtualizadas: 3, regrasCriadas: 1, regrasAtualizadas: 0 });

    const insert = ops.find((o) => o.verbo === "insert");
    expect(insert?.payload).toEqual({
      usuario_id: USER,
      palavra_chave: "DROGASIL",
      categoria_id: "cat-saude",
      prioridade: PRIORIDADE_REGRA_IA,
      origem: "ia",
    });
  });

  it("marca a origem como 'ia' e nunca sobrescreve categoria já definida", async () => {
    const { supabase, ops } = supabaseFalso({ afetadasPorDescricao: { X: 1 } });
    await aplicarSugestoes(supabase, USER, [
      { descricao: "X", categoriaId: "cat-saude", criarRegra: false },
    ]);

    const update = ops.find((o) => o.tabela === "transacoes" && o.verbo === "update");
    expect(update?.payload).toEqual({ categoria_id: "cat-saude", categoria_origem: "ia" });
    // a trava de idempotência: só toca no que ainda está sem categoria
    expect(update?.filtros).toContainEqual(["categoria_id", "is", null]);
  });

  it("atualiza a regra existente em vez de duplicar", async () => {
    const { supabase, ops } = supabaseFalso({
      afetadasPorDescricao: { "DROGASIL 1234": 1 },
      regrasExistentes: ["DROGASIL"],
    });

    const r = await aplicarSugestoes(supabase, USER, [
      { descricao: "DROGASIL 1234", categoriaId: "cat-saude", criarRegra: true },
    ]);

    expect(r.regrasCriadas).toBe(0);
    expect(r.regrasAtualizadas).toBe(1);
    expect(ops.some((o) => o.verbo === "insert")).toBe(false);
  });

  it("ignora categoria que o usuário não enxerga (id forjado no cliente)", async () => {
    const { supabase, ops } = supabaseFalso({
      categorias: ["cat-saude"],
      afetadasPorDescricao: { "DROGASIL 1234": 5 },
    });

    const r = await aplicarSugestoes(supabase, USER, [
      { descricao: "DROGASIL 1234", categoriaId: "cat-de-outro-usuario", criarRegra: true },
    ]);

    expect(r).toEqual({ transacoesAtualizadas: 0, regrasCriadas: 0, regrasAtualizadas: 0 });
    expect(ops.some((o) => o.tabela === "transacoes" && o.verbo === "update")).toBe(false);
  });

  it("aplica a categoria mas não cria regra quando o usuário recusou", async () => {
    const { supabase, ops } = supabaseFalso({ afetadasPorDescricao: { "DROGASIL 1234": 2 } });

    const r = await aplicarSugestoes(supabase, USER, [
      { descricao: "DROGASIL 1234", categoriaId: "cat-saude", criarRegra: false },
    ]);

    expect(r).toEqual({ transacoesAtualizadas: 2, regrasCriadas: 0, regrasAtualizadas: 0 });
    expect(ops.some((o) => o.tabela === "regras_categorizacao")).toBe(false);
  });

  it("não cria regra quando a descrição não tem âncora confiável", async () => {
    const { supabase, ops } = supabaseFalso({ afetadasPorDescricao: { "TARIFA 001": 1 } });

    const r = await aplicarSugestoes(supabase, USER, [
      { descricao: "TARIFA 001", categoriaId: "cat-servicos", criarRegra: true },
    ]);

    // categoria aplicada, regra não — é a covardia deliberada de extrairPalavraChave
    expect(r).toEqual({ transacoesAtualizadas: 1, regrasCriadas: 0, regrasAtualizadas: 0 });
    expect(ops.some((o) => o.verbo === "insert")).toBe(false);
  });

  it("propaga falha de escrita em vez de reportar sucesso parcial", async () => {
    const { supabase } = supabaseFalso({ erroNoUpdateDeTransacoes: true });
    await expect(
      aplicarSugestoes(supabase, USER, [
        { descricao: "X", categoriaId: "cat-saude", criarRegra: false },
      ]),
    ).rejects.toThrow(/Não foi possível aplicar/);
  });

  it("processa várias sugestões numa tacada", async () => {
    const { supabase } = supabaseFalso({
      afetadasPorDescricao: { "DROGASIL 1234": 2, "COBASI PET SHOP": 1 },
      regrasExistentes: ["COBASI"],
    });

    const r = await aplicarSugestoes(supabase, USER, [
      { descricao: "DROGASIL 1234", categoriaId: "cat-saude", criarRegra: true },
      { descricao: "COBASI PET SHOP", categoriaId: "cat-servicos", criarRegra: true },
    ]);

    expect(r).toEqual({ transacoesAtualizadas: 3, regrasCriadas: 1, regrasAtualizadas: 1 });
  });
});
