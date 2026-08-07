/**
 * Autenticação para rotas de servidor (não server functions).
 *
 * Duplica a lógica de `integrations/supabase/auth-middleware.ts` de propósito:
 * aquele arquivo é gerado automaticamente ("do not edit directly") e seria
 * sobrescrito. Mesmo contrato — Bearer verificado, client agindo como o
 * usuário, RLS fazendo o isolamento.
 *
 * O chat precisa de rota, e não de server function, porque devolve uma
 * resposta em streaming: o serializador de server function entrega tudo de
 * uma vez, o que anularia o streaming.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { ContextoCapacidade } from "@/lib/capacidades";

export class NaoAutorizadoError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "NaoAutorizadoError";
  }
}

function ehChaveNova(valor: string): boolean {
  return valor.startsWith("sb_publishable_") || valor.startsWith("sb_secret_");
}

function fetchComApiKey(chave: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((valor, nome) => headers.set(nome, valor));
    }
    // Chaves novas do Supabase são opacas, não JWT.
    if (ehChaveNova(chave) && headers.get("Authorization") === `Bearer ${chave}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", chave);
    return fetch(input, { ...init, headers });
  };
}

/** Valida o Bearer e devolve o contexto que as capacidades esperam. */
export async function autenticarRequisicao(request: Request): Promise<ContextoCapacidade> {
  const url = process.env["SUPABASE_URL"];
  const chave = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !chave) throw new Error("Supabase não configurado no servidor.");

  const cabecalho = request.headers.get("authorization");
  if (!cabecalho?.startsWith("Bearer ")) {
    throw new NaoAutorizadoError("Token ausente.");
  }

  const token = cabecalho.slice("Bearer ".length);
  if (token.split(".").length !== 3) throw new NaoAutorizadoError("Token inválido.");

  const supabase = createClient<Database>(url, chave, {
    global: { fetch: fetchComApiKey(chave), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new NaoAutorizadoError("Token inválido.");

  // O userId vem do JWT verificado — nunca do corpo da requisição.
  return { supabase, userId: data.claims.sub };
}
