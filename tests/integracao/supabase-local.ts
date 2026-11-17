/**
 * Acesso ao Supabase local (`npx supabase start`) para os testes de
 * integração. Nada aqui toca projeto remoto: a URL e as chaves vêm do
 * `supabase status` da máquina, ou das variáveis abaixo se definidas.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../src/integrations/supabase/types";

export type Cliente = SupabaseClient<Database>;

interface Ambiente {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

function lerAmbiente(): Ambiente {
  const doEnv = {
    url: process.env["SUPABASE_TESTE_URL"],
    anonKey: process.env["SUPABASE_TESTE_ANON_KEY"],
    serviceRoleKey: process.env["SUPABASE_TESTE_SERVICE_ROLE_KEY"],
  };
  if (doEnv.url && doEnv.anonKey && doEnv.serviceRoleKey) {
    return { url: doEnv.url, anonKey: doEnv.anonKey, serviceRoleKey: doEnv.serviceRoleKey };
  }

  let saida: string;
  try {
    saida = execSync("npx supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Supabase local não está rodando. Suba com `npx supabase start` antes.");
  }
  const status = JSON.parse(saida) as Record<string, string | undefined>;
  const url = status["API_URL"];
  const anonKey = status["ANON_KEY"];
  const serviceRoleKey = status["SERVICE_ROLE_KEY"];
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("`supabase status` não devolveu API_URL, ANON_KEY e SERVICE_ROLE_KEY.");
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`Recusando rodar contra ${url}: os testes de integração só usam banco local.`);
  }
  return { url, anonKey, serviceRoleKey };
}

const ambiente = lerAmbiente();
const semSessao = { auth: { persistSession: false, autoRefreshToken: false } };

/** Ignora RLS. Só para preparar dados e conferir o estado real do banco. */
export function clienteAdmin(): Cliente {
  return createClient<Database>(ambiente.url, ambiente.serviceRoleKey, semSessao);
}

/** Sem sessão: papel `anon`. */
export function clienteAnonimo(): Cliente {
  return createClient<Database>(ambiente.url, ambiente.anonKey, semSessao);
}

export interface UsuarioTeste {
  id: string;
  cliente: Cliente;
}

/** Cria um usuário confirmado e devolve um cliente autenticado como ele. */
export async function criarUsuario(admin: Cliente, rotulo: string): Promise<UsuarioTeste> {
  const email = `rls-${rotulo}-${randomUUID()}@teste.local`;
  const senha = `Senha-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`não criou o usuário ${rotulo}: ${error?.message}`);

  const cliente = clienteAnonimo();
  const login = await cliente.auth.signInWithPassword({ email, password: senha });
  if (login.error) throw new Error(`não autenticou o usuário ${rotulo}: ${login.error.message}`);
  return { id: data.user.id, cliente };
}

export async function removerUsuario(admin: Cliente, id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id);
}
