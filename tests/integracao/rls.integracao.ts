/**
 * Isolamento por usuário (RLS) contra um Postgres real.
 *
 * Roda no Supabase local com as migrations de `supabase/migrations`. Para cada
 * tabela com dado financeiro, o usuário A tenta ler, alterar, apagar e criar
 * linhas do usuário B — e deve falhar em tudo — e faz o mesmo com as próprias
 * linhas, que deve conseguir. O cliente admin (service role, ignora RLS) só
 * prepara os dados e confere o estado real do banco depois de cada tentativa.
 *
 *   npx supabase start
 *   npm run test:integracao
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clienteAdmin,
  clienteAnonimo,
  criarUsuario,
  removerUsuario,
  type Cliente,
  type UsuarioTeste,
} from "./supabase-local";

/** Código do Postgres para linha recusada por política de RLS. */
const VIOLACAO_RLS = "42501";

type NomeTabela =
  "perfis" | "contas" | "categorias" | "regras_categorizacao" | "transacoes" | "insights_mensais";

type Linha = Record<string, unknown>;

let mesesUsados = 0;

/** As tabelas variam por parâmetro; o tipo gerado não ajuda aqui. */
function de(cliente: Cliente, tabela: NomeTabela) {
  return (cliente as unknown as SupabaseClient).from(tabela);
}

interface Dados {
  usuario: UsuarioTeste;
  contaId: string;
  categoriaId: string;
  ids: Record<NomeTabela, string>;
}

interface Caso {
  tabela: NomeTabela;
  /** Coluna que diz de quem é a linha. */
  dono: "id" | "usuario_id";
  /** Coluna alterada nos testes de UPDATE. */
  campo: string;
  /** Linha nova para INSERT; `null` quando a tabela não aceita insert do usuário. */
  nova: ((d: Dados, usuarioId: string) => Linha) | null;
}

const CASOS: Caso[] = [
  { tabela: "perfis", dono: "id", campo: "nome_exibicao", nova: null },
  {
    tabela: "contas",
    dono: "usuario_id",
    campo: "nome",
    nova: (_d, usuarioId) => ({ usuario_id: usuarioId, nome: "Conta nova" }),
  },
  {
    tabela: "categorias",
    dono: "usuario_id",
    campo: "cor",
    nova: (_d, usuarioId) => ({ usuario_id: usuarioId, nome: `Categoria ${randomUUID()}` }),
  },
  {
    tabela: "regras_categorizacao",
    dono: "usuario_id",
    campo: "prioridade",
    nova: (d, usuarioId) => ({
      usuario_id: usuarioId,
      palavra_chave: `chave-${randomUUID()}`,
      categoria_id: d.categoriaId,
    }),
  },
  {
    tabela: "transacoes",
    dono: "usuario_id",
    campo: "descricao",
    nova: (d, usuarioId) => ({
      usuario_id: usuarioId,
      conta_id: d.contaId,
      data: "2026-01-20",
      descricao: "LANCAMENTO NOVO",
      valor: 1,
      tipo: "DEBITO",
      origem: "MANUAL",
      hash_dedupe: randomUUID(),
    }),
  },
  {
    tabela: "insights_mensais",
    dono: "usuario_id",
    campo: "texto",
    nova: (_d, usuarioId) => ({
      usuario_id: usuarioId,
      // (usuario_id, mes) é único: cada linha nova pega um mês ainda não usado.
      mes: `2030-${String(++mesesUsados).padStart(2, "0")}`,
      texto: "Insight novo",
      impressao: randomUUID(),
    }),
  },
];

const VALOR_ALTERADO: Record<NomeTabela, unknown> = {
  perfis: "alterado",
  contas: "alterado",
  categorias: "#000000",
  regras_categorizacao: 1,
  transacoes: "alterado",
  insights_mensais: "alterado",
};

const admin = clienteAdmin();
let a: Dados;
let b: Dados;

async function inserirComoAdmin(tabela: NomeTabela, linha: Linha): Promise<string> {
  const { data, error } = await de(admin, tabela).insert(linha).select("id").single();
  if (error) throw new Error(`preparo em ${tabela}: ${error.message}`);
  return (data as { id: string }).id;
}

async function prepararDados(rotulo: string): Promise<Dados> {
  const usuario = await criarUsuario(admin, rotulo);
  const u = usuario.id;

  const contaId = await inserirComoAdmin("contas", { usuario_id: u, nome: `Conta ${rotulo}` });
  const categoriaId = await inserirComoAdmin("categorias", {
    usuario_id: u,
    nome: `Categoria ${rotulo}`,
  });
  const regraId = await inserirComoAdmin("regras_categorizacao", {
    usuario_id: u,
    palavra_chave: `chave-${rotulo}`,
    categoria_id: categoriaId,
  });
  const transacaoId = await inserirComoAdmin("transacoes", {
    usuario_id: u,
    conta_id: contaId,
    data: "2026-01-15",
    descricao: `LANCAMENTO ${rotulo}`,
    valor: 10,
    tipo: "DEBITO",
    origem: "MANUAL",
    hash_dedupe: randomUUID(),
    categoria_id: categoriaId,
  });
  const insightId = await inserirComoAdmin("insights_mensais", {
    usuario_id: u,
    mes: "2026-01",
    texto: `Insight ${rotulo}`,
    impressao: randomUUID(),
  });

  // O perfil nasce pelo trigger `on_auth_user_created`.
  const perfil = await de(admin, "perfis").select("id").eq("id", u).single();
  if (perfil.error) throw new Error(`perfil de ${rotulo} não foi criado pelo trigger`);

  return {
    usuario,
    contaId,
    categoriaId,
    ids: {
      perfis: u,
      contas: contaId,
      categorias: categoriaId,
      regras_categorizacao: regraId,
      transacoes: transacaoId,
      insights_mensais: insightId,
    },
  };
}

/** Estado real da linha, lido sem RLS. */
async function linhaReal(tabela: NomeTabela, id: string): Promise<Linha | null> {
  const { data, error } = await de(admin, tabela).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Linha | null;
}

beforeAll(async () => {
  a = await prepararDados("a");
  b = await prepararDados("b");
});

afterAll(async () => {
  // ON DELETE CASCADE leva todas as linhas dos dois usuários junto.
  if (a) await removerUsuario(admin, a.usuario.id);
  if (b) await removerUsuario(admin, b.usuario.id);
});

describe.each(CASOS)("RLS em $tabela", ({ tabela, dono, campo, nova }) => {
  it("A lê a própria linha", async () => {
    const { data, error } = await de(a.usuario.cliente, tabela)
      .select("id")
      .eq("id", a.ids[tabela]);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("A não lê a linha de B", async () => {
    const { data, error } = await de(a.usuario.cliente, tabela)
      .select("id")
      .eq("id", b.ids[tabela]);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("A não enxerga nenhuma linha de B nem filtrando pelo dono", async () => {
    const { data, error } = await de(a.usuario.cliente, tabela).select("id").eq(dono, b.usuario.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("A não altera a linha de B", async () => {
    const antes = await linhaReal(tabela, b.ids[tabela]);
    const { data, error } = await de(a.usuario.cliente, tabela)
      .update({ [campo]: VALOR_ALTERADO[tabela] })
      .eq("id", b.ids[tabela])
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await linhaReal(tabela, b.ids[tabela])).toEqual(antes);
  });

  it("A não apaga a linha de B", async () => {
    const { data, error } = await de(a.usuario.cliente, tabela)
      .delete()
      .eq("id", b.ids[tabela])
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect(await linhaReal(tabela, b.ids[tabela])).not.toBeNull();
  });

  it("A não passa a própria linha para B", async () => {
    const { error } = await de(a.usuario.cliente, tabela)
      .update({ [dono]: b.usuario.id })
      .eq("id", a.ids[tabela]);
    expect(error?.code).toBe(VIOLACAO_RLS);
    expect((await linhaReal(tabela, a.ids[tabela]))?.[dono]).toBe(a.usuario.id);
  });

  it("A altera a própria linha", async () => {
    const { data, error } = await de(a.usuario.cliente, tabela)
      .update({ [campo]: VALOR_ALTERADO[tabela] })
      .eq("id", a.ids[tabela])
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect((await linhaReal(tabela, a.ids[tabela]))?.[campo]).toBe(VALOR_ALTERADO[tabela]);
  });

  if (nova) {
    it("A não cria linha em nome de B", async () => {
      const { error } = await de(a.usuario.cliente, tabela).insert(nova(a, b.usuario.id));
      expect(error?.code).toBe(VIOLACAO_RLS);
    });

    it("A cria e apaga uma linha própria", async () => {
      const criada = await de(a.usuario.cliente, tabela)
        .insert(nova(a, a.usuario.id))
        .select("id")
        .single();
      expect(criada.error).toBeNull();
      const id = (criada.data as { id: string }).id;

      const apagada = await de(a.usuario.cliente, tabela).delete().eq("id", id).select("id");
      expect(apagada.error).toBeNull();
      expect(apagada.data).toHaveLength(1);
      expect(await linhaReal(tabela, id)).toBeNull();
    });
  } else {
    it("A não cria perfil com o id de B", async () => {
      const { error } = await de(a.usuario.cliente, tabela).insert({ id: b.usuario.id });
      expect(error?.code).toBe(VIOLACAO_RLS);
    });

    it("A apaga o próprio perfil", async () => {
      const apagado = await de(a.usuario.cliente, tabela)
        .delete()
        .eq("id", a.usuario.id)
        .select("id");
      expect(apagado.error).toBeNull();
      expect(apagado.data).toHaveLength(1);
      // Recria para não afetar os demais testes.
      await inserirComoAdmin("perfis", { id: a.usuario.id });
    });
  }

  it("sem sessão não lê nada", async () => {
    const { data } = await de(clienteAnonimo(), tabela).select("id");
    expect(data ?? []).toEqual([]);
  });

  if (nova) {
    it("sem sessão não cria linha", async () => {
      const { error } = await de(clienteAnonimo(), tabela).insert(nova(a, a.usuario.id));
      expect(error).not.toBeNull();
    });
  }
});

// Categorias e regras têm linhas do sistema (usuario_id NULL): todo usuário
// lê, ninguém altera.
describe.each(["categorias", "regras_categorizacao"] as const)(
  "linhas do sistema em %s",
  (tabela) => {
    let idSistema: string;

    beforeAll(async () => {
      const { data, error } = await de(admin, tabela)
        .select("id")
        .is("usuario_id", null)
        .limit(1)
        .single();
      if (error) throw new Error(`sem linha do sistema em ${tabela}: ${error.message}`);
      idSistema = (data as { id: string }).id;
    });

    it("A lê as linhas do sistema", async () => {
      const { data, error } = await de(a.usuario.cliente, tabela).select("id").eq("id", idSistema);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("A não altera linha do sistema", async () => {
      const antes = await linhaReal(tabela, idSistema);
      const campo = tabela === "categorias" ? "cor" : "prioridade";
      const { data, error } = await de(a.usuario.cliente, tabela)
        .update({ [campo]: VALOR_ALTERADO[tabela] })
        .eq("id", idSistema)
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      expect(await linhaReal(tabela, idSistema)).toEqual(antes);
    });

    it("A não apaga linha do sistema", async () => {
      const { data, error } = await de(a.usuario.cliente, tabela)
        .delete()
        .eq("id", idSistema)
        .select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
      expect(await linhaReal(tabela, idSistema)).not.toBeNull();
    });

    it("A não cria linha do sistema", async () => {
      const linha: Linha =
        tabela === "categorias"
          ? { usuario_id: null, nome: `Sistema ${randomUUID()}` }
          : {
              usuario_id: null,
              palavra_chave: `sistema-${randomUUID()}`,
              categoria_id: a.categoriaId,
            };
      const { error } = await de(a.usuario.cliente, tabela).insert(linha);
      expect(error?.code).toBe(VIOLACAO_RLS);
    });
  },
);

// Uma linha de A não pode apontar para conta ou categoria de B. Sem essa
// trava, A grava uma transação na conta de B e, quando B apaga a conta, o
// ON DELETE CASCADE apaga a transação de A.
describe("referências a dados de outro usuário", () => {
  let categoriaSistema: string;

  beforeAll(async () => {
    const { data, error } = await de(admin, "categorias")
      .select("id")
      .is("usuario_id", null)
      .limit(1)
      .single();
    if (error) throw new Error(`sem categoria do sistema: ${error.message}`);
    categoriaSistema = (data as { id: string }).id;
  });

  function transacaoDeA(extra: Linha): Linha {
    return {
      usuario_id: a.usuario.id,
      conta_id: a.contaId,
      data: "2026-01-21",
      descricao: "REFERENCIA",
      valor: 1,
      tipo: "DEBITO",
      origem: "MANUAL",
      hash_dedupe: randomUUID(),
      ...extra,
    };
  }

  it("A não cria transação na conta de B", async () => {
    const { error } = await de(a.usuario.cliente, "transacoes").insert(
      transacaoDeA({ conta_id: b.contaId }),
    );
    expect(error?.code).toBe(VIOLACAO_RLS);
  });

  it("A não cria transação com categoria de B", async () => {
    const { error } = await de(a.usuario.cliente, "transacoes").insert(
      transacaoDeA({ categoria_id: b.categoriaId }),
    );
    expect(error?.code).toBe(VIOLACAO_RLS);
  });

  it("A não move a própria transação para a conta ou a categoria de B", async () => {
    for (const patch of [{ conta_id: b.contaId }, { categoria_id: b.categoriaId }]) {
      const { error } = await de(a.usuario.cliente, "transacoes")
        .update(patch)
        .eq("id", a.ids.transacoes);
      expect(error?.code).toBe(VIOLACAO_RLS);
    }
    const real = await linhaReal("transacoes", a.ids.transacoes);
    expect(real?.["conta_id"]).toBe(a.contaId);
    expect(real?.["categoria_id"]).toBe(a.categoriaId);
  });

  it("A cria transação com categoria própria, do sistema ou sem categoria", async () => {
    for (const categoria_id of [a.categoriaId, categoriaSistema, null]) {
      const { error } = await de(a.usuario.cliente, "transacoes").insert(
        transacaoDeA({ categoria_id }),
      );
      expect(error).toBeNull();
    }
  });

  it("A não cria regra com categoria de B", async () => {
    const { error } = await de(a.usuario.cliente, "regras_categorizacao").insert({
      usuario_id: a.usuario.id,
      palavra_chave: `ref-${randomUUID()}`,
      categoria_id: b.categoriaId,
    });
    expect(error?.code).toBe(VIOLACAO_RLS);
  });

  it("A não aponta a própria regra para a categoria de B", async () => {
    const { error } = await de(a.usuario.cliente, "regras_categorizacao")
      .update({ categoria_id: b.categoriaId })
      .eq("id", a.ids.regras_categorizacao);
    expect(error?.code).toBe(VIOLACAO_RLS);
    expect(
      (await linhaReal("regras_categorizacao", a.ids.regras_categorizacao))?.["categoria_id"],
    ).toBe(a.categoriaId);
  });

  it("A cria regra com categoria própria ou do sistema", async () => {
    for (const categoria_id of [a.categoriaId, categoriaSistema]) {
      const { error } = await de(a.usuario.cliente, "regras_categorizacao").insert({
        usuario_id: a.usuario.id,
        palavra_chave: `ref-${randomUUID()}`,
        categoria_id,
      });
      expect(error).toBeNull();
    }
  });
});
