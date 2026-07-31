import { z } from "zod";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
import { resultadoJson } from "../resultado";
import { calcularHashDedupe } from "@/lib/import/dedupe";

export const criarTransacaoTool = defineTool({
  name: "criar_transacao",
  title: "Criar transação manual",
  description:
    "Registra manualmente uma transação (entrada ou saída) em uma conta do usuário. Use listar_contas_categorias antes para obter contaId e categoriaId válidos.",
  inputSchema: {
    contaId: z.string().uuid().describe("ID da conta onde o lançamento será registrado."),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data do lançamento (AAAA-MM-DD)."),
    descricao: z.string().min(1).max(200).describe("Descrição do lançamento."),
    valor: z.number().positive().describe("Valor absoluto em reais, sempre positivo."),
    tipo: z.enum(["DEBITO", "CREDITO"]).describe("DEBITO para gasto/saída, CREDITO para entrada/receita."),
    categoriaId: z.string().uuid().optional().describe("Categoria opcional do lançamento."),
  },
  outputSchema: undefined,
  handler: async (args, ctx: ToolContext) => {
    const supabase = supabaseForUser(ctx);
    const usuarioId = ctx.getUserId();
    if (!usuarioId) throw new Error("Chamada sem usuário autenticado");

    const { data: conta, error: erroConta } = await supabase
      .from("contas")
      .select("id")
      .eq("id", args.contaId)
      .maybeSingle();
    if (erroConta) throw new Error(`Erro ao validar conta: ${erroConta.message}`);
    if (!conta) throw new Error("Conta não encontrada para este usuário");

    const hash = await calcularHashDedupe({
      usuarioId,
      contaId: args.contaId,
      data: args.data,
      valor: args.valor,
      tipo: args.tipo,
      descricao: args.descricao,
    });

    const { data, error } = await supabase
      .from("transacoes")
      .insert({
        usuario_id: usuarioId,
        conta_id: args.contaId,
        data: args.data,
        descricao: args.descricao,
        valor: args.valor,
        tipo: args.tipo,
        categoria_id: args.categoriaId ?? null,
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

    return resultadoJson({ criada: true, transacao: data });
  },
});
