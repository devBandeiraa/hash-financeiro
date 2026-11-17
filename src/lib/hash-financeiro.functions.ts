/**
 * Server functions do Hash Financeiro. Toda leitura/escrita passa por
 * `requireSupabaseAuth`: o cliente age como o usuário logado e o RLS do banco
 * garante o isolamento. Nenhum dado financeiro é logado.
 *
 * A implementação fica em `src/lib/servico`, um arquivo por domínio. Este
 * arquivo só reexporta, para quem importa daqui continuar funcionando.
 */
export * from "./servico/contas.functions";
export * from "./servico/categorias.functions";
export * from "./servico/importacao.functions";
export * from "./servico/transacoes.functions";
export * from "./servico/dashboard.functions";
export * from "./servico/privacidade.functions";
export * from "./servico/ia.functions";
export * from "./servico/agente.functions";
