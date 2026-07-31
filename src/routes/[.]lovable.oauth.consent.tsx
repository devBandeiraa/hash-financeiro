import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthDetails = {
  client?: { name?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
};

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthDetails | null; error: Error | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("authorization_id ausente");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consentimento,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="panel hairline-top w-full max-w-md p-7">
        <p className="eyebrow">FinPessoal</p>
        <h1 className="font-display mt-1 text-xl font-bold tracking-tight">
          Não foi possível carregar esta autorização
        </h1>
        <p className="mt-2 text-[13px] text-ink-faint">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function Consentimento() {
  const detalhes = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const nomeCliente = detalhes?.client?.name ?? "este aplicativo";

  async function decidir(aprovar: boolean) {
    setOcupado(true);
    setErro(null);
    const api = oauthApi();
    const { data, error } = aprovar
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setOcupado(false);
      setErro(error.message);
      return;
    }
    const destino = data?.redirect_url ?? data?.redirect_to;
    if (!destino) {
      setOcupado(false);
      setErro("O servidor de autorização não retornou um redirecionamento.");
      return;
    }
    window.location.href = destino;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="panel hairline-top stage w-full max-w-md p-7">
        <p className="eyebrow">Integração de agente</p>
        <h1 className="font-display mt-1 text-2xl font-bold tracking-tight">
          Conectar {nomeCliente} à sua conta
        </h1>
        <p className="mt-2 text-[13px] text-ink-faint">
          {nomeCliente} poderá ler e alterar seus dados do FinPessoal — contas, transações,
          categorias e regras — agindo como você. Nenhum outro usuário é acessível.
        </p>

        {erro && (
          <p role="alert" className="mt-4 text-[13px] text-destructive">
            {erro}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Button className="flex-1" disabled={ocupado} onClick={() => decidir(true)}>
            Autorizar
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            disabled={ocupado}
            onClick={() => decidir(false)}
          >
            Recusar
          </Button>
        </div>
      </div>
    </main>
  );
}
