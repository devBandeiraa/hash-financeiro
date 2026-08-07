/**
 * Capacidades do Hash Financeiro — o que o sistema sabe fazer sobre as
 * finanças de UM usuário, sem saber por qual protocolo foi chamado.
 *
 * Existiam duas implementações da mesma coisa: as 6 ferramentas do servidor
 * MCP (autenticadas por OAuth) e as server functions do app (autenticadas por
 * sessão). Elas já divergiam — `resumo_dashboard` do MCP e `resumoDashboard`
 * do app agregavam de formas diferentes. Este módulo é a implementação única;
 * MCP e agente interno viram adaptadores finos por cima.
 *
 * SEGURANÇA: nenhuma capacidade recebe `userId` por argumento — ele vem do
 * contexto, que só quem autenticou monta. O modelo nunca escolhe de quem é o
 * dado. O isolamento continua sendo imposto pelo RLS do banco: o `supabase`
 * daqui é sempre um client agindo como o usuário logado.
 */
import { z } from "zod";

import { calcularHashDedupe } from "@/lib/import/dedupe";

/** Client do Supabase já autenticado como o usuário. Ver `SupabaseMinimo`. */
export interface ContextoCapacidade {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (tabela: string) => any };
  userId: string;
}

/**
 * `leitura` responde perguntas; `escrita` altera dados e por isso nunca é
 * executada direto pelo agente — vira proposta para o usuário confirmar.
 */
export type NaturezaCapacidade = "leitura" | "escrita";

/** Traduz um UUID em nome legível (categoria, conta) para a confirmação. */
export type ResolvedorDeNome = (id: string) => string | undefined;

export interface Capacidade<Forma extends z.ZodRawShape = z.ZodRawShape> {
  nome: string;
  titulo: string;
  descricao: string;
  /** Forma crua (não `z.object`): o MCP consome assim. */
  entrada: Forma;
  natureza: NaturezaCapacidade;
  /**
   * Frase curta para o usuário confirmar. Só nas de escrita.
   *
   * Recebe um resolvedor de nomes porque os argumentos carregam UUID, e
   * "criar regra UBER -> 1111-0000-..." não é uma confirmação que alguém
   * consiga avaliar. Quem chama injeta o mapa que já tem em mãos.
   *
   * `any` porque o catálogo é heterogêneo: cada capacidade tem sua própria
   * forma de argumentos, e tipar a menos quebraria a atribuição do catálogo.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descreverAcao?: (args: any, nomeDe?: ResolvedorDeNome) => string;
  executar: (ctx: ContextoCapacidade, args: z.infer<z.ZodObject<Forma>>) => Promise<unknown>;
}

const arredondar = (n: number) => Number(n.toFixed(2));

// ---------------------------------------------------------------- leitura ---

export const listarContasCategorias = {
  nome: "listar_contas_categorias",
  titulo: "Listar contas e categorias",
  descricao:
    "Lista as contas financeiras e as categorias disponíveis para o usuário autenticado. Use esta ferramenta primeiro para obter os IDs necessários nas demais chamadas.",
  entrada: {},
  natureza: "leitura",
  async executar({ supabase }) {
    const [contas, categorias] = await Promise.all([
      supabase.from("contas").select("id, nome, tipo").order("nome", { ascending: true }),
      supabase.from("categorias").select("id, nome, cor").order("nome", { ascending: true }),
    ]);
    if (contas.error) throw new Error(`Erro ao buscar contas: ${contas.error.message}`);
    if (categorias.error) throw new Error(`Erro ao buscar categorias: ${categorias.error.message}`);
    return { contas: contas.data, categorias: categorias.data };
  },
} satisfies Capacidade<Record<string, never>>;

const entradaResumo = {
  mes: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe("Mês de referência no formato AAAA-MM. Padrão: mês atual."),
};

export const resumoDashboard = {
  nome: "resumo_dashboard",
  titulo: "Resumo financeiro do mês",
  descricao:
    "Retorna o resumo financeiro de um mês: total de entradas, total de saídas, saldo do período e gastos agrupados por categoria. Use quando o usuário perguntar quanto gastou ou como está o mês.",
  entrada: entradaResumo,
  natureza: "leitura",
  async executar({ supabase }, args) {
    const mes = args.mes ?? new Date().toISOString().slice(0, 7);
    const [ano, m] = mes.split("-").map(Number) as [number, number];
    const inicio = `${mes}-01`;
    // Primeiro dia do mês seguinte: evita depender de quantos dias o mês tem.
    const fim = new Date(Date.UTC(ano, m, 1)).toISOString().slice(0, 10);

    const [transacoes, categorias] = await Promise.all([
      supabase
        .from("transacoes")
        .select("valor, tipo, categoria_id")
        .gte("data", inicio)
        .lt("data", fim),
      supabase.from("categorias").select("id, nome"),
    ]);
    if (transacoes.error) throw new Error(`Erro ao buscar transações: ${transacoes.error.message}`);

    const nomePorId = new Map(
      ((categorias.data ?? []) as Array<{ id: string; nome: string }>).map((c) => [c.id, c.nome]),
    );

    let entradas = 0;
    let saidas = 0;
    const porCategoria = new Map<string, number>();

    for (const t of (transacoes.data ?? []) as Array<Record<string, unknown>>) {
      const valor = Math.abs(Number(t["valor"]));
      if (t["tipo"] === "CREDITO") {
        entradas += valor;
        continue;
      }
      saidas += valor;
      const id = t["categoria_id"] as string | null;
      const nome = id ? (nomePorId.get(id) ?? "Sem categoria") : "Sem categoria";
      porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + valor);
    }

    return {
      mes,
      periodo: { inicio, fim },
      totalTransacoes: transacoes.data?.length ?? 0,
      entradas: arredondar(entradas),
      saidas: arredondar(saidas),
      saldo: arredondar(entradas - saidas),
      gastosPorCategoria: [...porCategoria.entries()]
        .map(([categoria, total]) => ({ categoria, total: arredondar(total) }))
        .sort((a, b) => b.total - a.total),
    };
  },
} satisfies Capacidade<typeof entradaResumo>;

const entradaListarTransacoes = {
  dataInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Data inicial (AAAA-MM-DD)."),
  dataFim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Data final (AAAA-MM-DD)."),
  contaId: z.string().uuid().optional().describe("Filtra por conta."),
  categoriaId: z.string().uuid().optional().describe("Filtra por categoria."),
  busca: z.string().min(1).optional().describe("Texto contido na descrição."),
  limite: z.number().int().min(1).max(200).optional().describe("Máximo de itens (padrão 50)."),
};

export const listarTransacoes = {
  nome: "listar_transacoes",
  titulo: "Listar transações",
  descricao:
    "Lista transações do usuário com filtros opcionais por período, conta, categoria e texto na descrição. Use para responder perguntas sobre lançamentos específicos.",
  entrada: entradaListarTransacoes,
  natureza: "leitura",
  async executar({ supabase }, args) {
    let query = supabase
      .from("transacoes")
      .select("id, data, descricao, valor, tipo, conta_id, categoria_id, categoria_origem, origem")
      .order("data", { ascending: false })
      .limit(args.limite ?? 50);

    if (args.dataInicio) query = query.gte("data", args.dataInicio);
    if (args.dataFim) query = query.lte("data", args.dataFim);
    if (args.contaId) query = query.eq("conta_id", args.contaId);
    if (args.categoriaId) query = query.eq("categoria_id", args.categoriaId);
    if (args.busca) query = query.ilike("descricao", `%${args.busca}%`);

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao listar transações: ${error.message}`);
    return { total: data?.length ?? 0, transacoes: data ?? [] };
  },
} satisfies Capacidade<typeof entradaListarTransacoes>;

export const listarRegras = {
  nome: "listar_regras",
  titulo: "Listar regras de categorização",
  descricao:
    "Lista as regras de categorização automática (palavra-chave → categoria) que o motor determinístico aplica.",
  entrada: {},
  natureza: "leitura",
  async executar({ supabase }) {
    const { data, error } = await supabase
      .from("regras_categorizacao")
      .select("id, palavra_chave, categoria_id, prioridade, ativa, usuario_id, origem")
      .order("prioridade", { ascending: true });
    if (error) throw new Error(`Erro ao listar regras: ${error.message}`);
    return { total: data?.length ?? 0, regras: data ?? [] };
  },
} satisfies Capacidade<Record<string, never>>;

// ---------------------------------------------------------------- escrita ---

const entradaCriarTransacao = {
  contaId: z.string().uuid().describe("ID da conta onde o lançamento será registrado."),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Data do lançamento (AAAA-MM-DD)."),
  descricao: z.string().min(1).max(200).describe("Descrição do lançamento."),
  valor: z.number().positive().describe("Valor absoluto em reais, sempre positivo."),
  tipo: z
    .enum(["DEBITO", "CREDITO"])
    .describe("DEBITO para gasto/saída, CREDITO para entrada/receita."),
  categoriaId: z.string().uuid().optional().describe("Categoria opcional do lançamento."),
};

export const criarTransacao = {
  nome: "criar_transacao",
  titulo: "Criar transação manual",
  descricao:
    "Registra manualmente uma transação (entrada ou saída) em uma conta do usuário. Use listar_contas_categorias antes para obter contaId e categoriaId válidos.",
  entrada: entradaCriarTransacao,
  natureza: "escrita",
  descreverAcao: (a, nomeDe) => {
    const categoria = a.categoriaId ? ` em ${nomeDe?.(a.categoriaId) ?? "categoria"}` : "";
    const especie = a.tipo === "DEBITO" ? "saída" : "entrada";
    return `Criar ${especie} de R$ ${a.valor.toFixed(2)} em ${a.data}: "${a.descricao}"${categoria}`;
  },
  async executar({ supabase, userId }, args) {
    const { data: conta, error: erroConta } = await supabase
      .from("contas")
      .select("id")
      .eq("id", args.contaId)
      .maybeSingle();
    if (erroConta) throw new Error(`Erro ao validar conta: ${erroConta.message}`);
    if (!conta) throw new Error("Conta não encontrada para este usuário");

    const hash = await calcularHashDedupe({
      usuarioId: userId,
      contaId: args.contaId,
      data: args.data,
      valor: args.valor,
      tipo: args.tipo,
      descricao: args.descricao,
    });

    const { data, error } = await supabase
      .from("transacoes")
      .insert({
        usuario_id: userId,
        conta_id: args.contaId,
        data: args.data,
        descricao: args.descricao,
        valor: args.valor,
        tipo: args.tipo,
        categoria_id: args.categoriaId ?? null,
        // Quem escolheu a categoria foi um modelo (agente ou cliente MCP),
        // mesmo que sob confirmação do usuário. A trilha registra isso.
        categoria_origem: args.categoriaId ? "ia" : "sistema",
        origem: "MANUAL",
        hash_dedupe: hash,
      })
      .select("id, data, descricao, valor, tipo, categoria_id")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("Já existe um lançamento idêntico nessa conta (duplicado bloqueado).");
      }
      throw new Error(`Erro ao criar transação: ${error.message}`);
    }
    return { criada: true, transacao: data };
  },
} satisfies Capacidade<typeof entradaCriarTransacao>;

const entradaCategorizar = {
  transacaoId: z.string().uuid().describe("ID da transação a atualizar."),
  categoriaId: z
    .string()
    .uuid()
    .nullable()
    .describe("ID da nova categoria, ou null para remover a categoria."),
};

export const categorizarTransacao = {
  nome: "categorizar_transacao",
  titulo: "Categorizar transação",
  descricao:
    "Altera a categoria de uma transação existente. Útil para corrigir classificações erradas feitas pelo motor automático.",
  entrada: entradaCategorizar,
  natureza: "escrita",
  descreverAcao: (a, nomeDe) =>
    a.categoriaId
      ? `Alterar a categoria deste lançamento para ${nomeDe?.(a.categoriaId) ?? "outra categoria"}`
      : "Remover a categoria deste lançamento",
  async executar({ supabase }, args) {
    // `ia` porque um modelo escolheu esta categoria. A confirmação do usuário
    // legitima a ação, mas não apaga o fato de um modelo ter participado --
    // é exatamente isso que a auditoria precisa saber. Correção feita pelo
    // dropdown da interface continua marcando `usuario`.
    const { data, error } = await supabase
      .from("transacoes")
      .update({ categoria_id: args.categoriaId, categoria_origem: "ia" })
      .eq("id", args.transacaoId)
      .select("id, descricao, categoria_id, categoria_origem")
      .maybeSingle();

    if (error) throw new Error(`Erro ao categorizar: ${error.message}`);
    if (!data) throw new Error("Transação não encontrada para este usuário");
    return { atualizada: true, transacao: data };
  },
} satisfies Capacidade<typeof entradaCategorizar>;

const entradaCriarRegra = {
  palavraChave: z.string().min(2).max(60).describe("Texto procurado na descrição do lançamento."),
  categoriaId: z.string().uuid().describe("Categoria que a regra aplica."),
  prioridade: z.number().int().min(1).max(1000).optional().describe("Menor vence. Padrão 100."),
};

export const criarRegra = {
  nome: "criar_regra",
  titulo: "Criar regra de categorização",
  descricao:
    "Cria uma regra que categoriza automaticamente lançamentos futuros cuja descrição contenha a palavra-chave.",
  entrada: entradaCriarRegra,
  natureza: "escrita",
  descreverAcao: (a, nomeDe) =>
    `Criar regra: descrições com "${a.palavraChave.toUpperCase()}" → ${
      nomeDe?.(a.categoriaId) ?? "categoria"
    }`,
  async executar({ supabase, userId }, args) {
    const { data, error } = await supabase
      .from("regras_categorizacao")
      .insert({
        usuario_id: userId,
        palavra_chave: args.palavraChave.toUpperCase(),
        categoria_id: args.categoriaId,
        prioridade: args.prioridade ?? 100,
        ativa: true,
        // Um modelo escolheu a palavra-chave e a categoria, ainda que o
        // usuário tenha pedido e confirmado. Marca `ia` pelo mesmo motivo
        // que `categorizar_transacao`.
        origem: "ia",
      })
      .select("id, palavra_chave, categoria_id, prioridade, ativa, origem")
      .single();

    if (error) throw new Error(`Erro ao criar regra: ${error.message}`);
    return { criada: true, regra: data };
  },
} satisfies Capacidade<typeof entradaCriarRegra>;

// ------------------------------------------------------------- catálogo ---

/**
 * Visão frouxa de uma capacidade, para guardar todas na mesma lista.
 *
 * `Capacidade<Forma>` dá tipagem exata no ponto de definição; aqui os
 * argumentos precisam ser `any` porque o catálogo é heterogêneo e `executar`
 * é contravariante — tipar a menos faria nenhuma capacidade caber na lista.
 */
export interface CapacidadeExecutavel {
  nome: string;
  titulo: string;
  descricao: string;
  entrada: z.ZodRawShape;
  natureza: NaturezaCapacidade;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descreverAcao?: (args: any, nomeDe?: ResolvedorDeNome) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executar: (ctx: ContextoCapacidade, args: any) => Promise<unknown>;
}

/** Todas as capacidades, na ordem em que o agente deve considerá-las. */
export const CAPACIDADES: ReadonlyArray<CapacidadeExecutavel> = [
  listarContasCategorias,
  resumoDashboard,
  listarTransacoes,
  listarRegras,
  criarTransacao,
  categorizarTransacao,
  criarRegra,
];

export function capacidadePorNome(nome: string): CapacidadeExecutavel | undefined {
  return CAPACIDADES.find((c) => c.nome === nome);
}

/**
 * Executa uma capacidade validando os argumentos contra o schema dela.
 * O modelo erra formato com frequência: validar aqui transforma isso numa
 * mensagem que ele consegue corrigir, em vez de uma query malformada.
 */
export async function executarCapacidade(
  nome: string,
  ctx: ContextoCapacidade,
  args: unknown,
): Promise<unknown> {
  const capacidade = capacidadePorNome(nome);
  if (!capacidade) throw new Error(`Ferramenta desconhecida: ${nome}`);

  const validados = z.object(capacidade.entrada).safeParse(args ?? {});
  if (!validados.success) {
    throw new Error(`Argumentos inválidos para ${nome}: ${validados.error.issues[0]?.message}`);
  }

  return capacidade.executar(ctx, validados.data);
}
