import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SilkBackground } from "@/components/silk-background";


export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s["next"] === "string" ? { next: s["next"] } : {},
  head: () => ({
    meta: [
      { title: "Entrar no Hash Financeiro" },
      {
        name: "description",
        content: "Acesse sua conta do Hash Financeiro para importar extratos e acompanhar seus gastos.",
      },
      { property: "og:title", content: "Entrar no Hash Financeiro" },
      {
        property: "og:description",
        content: "Acesse sua conta do Hash Financeiro para importar extratos e acompanhar seus gastos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Só aceitamos caminhos relativos same-origin como destino pós-login.
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  const urlRetorno = () =>
    destino ? `${window.location.origin}${destino}` : window.location.origin;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setCarregando(true);
    try {
      if (modo === "criar") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            emailRedirectTo: urlRetorno(),
            data: { nome_exibicao: nome || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Conta criada. Confirme o e-mail que enviamos para entrar.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      }
      if (destino) {
        window.location.href = destino;
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Não foi possível autenticar.";
      toast.error(mensagem);
    } finally {
      setCarregando(false);
    }
  }

  async function entrarComGoogle() {
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: urlRetorno() });
    } catch {
      toast.error("Não foi possível iniciar o login com Google.");
    }
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12">
      <SilkBackground fixed />
      <div className="panel hairline-top stage relative w-full max-w-md p-7 shadow-xl">

        <p className="eyebrow">Hash Financeiro</p>
        <h1 className="font-display mt-1 text-2xl font-bold tracking-tight">
          {modo === "entrar" ? "Entrar" : "Criar conta"}
        </h1>
        <p className="mt-1 text-[13px] text-ink-faint">
          Seus dados financeiros ficam isolados por usuário no banco.
        </p>

        <div className="mt-6 space-y-4">
          <Button variant="outline" className="w-full" onClick={entrarComGoogle}>
            Continuar com Google
          </Button>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-ink-faint">
            <span className="h-px flex-1 bg-hairline" /> ou{" "}
            <span className="h-px flex-1 bg-hairline" />
          </div>
          <form onSubmit={enviar} className="space-y-4">
            {modo === "criar" && (
              <div className="space-y-2">
                <Label htmlFor="nome" className="eyebrow">
                  Nome de exibição
                </Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="eyebrow">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha" className="eyebrow">
                Senha
              </Label>
              <Input
                id="senha"
                type="password"
                autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={carregando}>
              {carregando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button
            type="button"
            className="w-full text-[13px] text-ink-dim underline-offset-4 hover:underline"
            onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
          >
            {modo === "entrar" ? "Não tem conta? Criar agora" : "Já tenho conta"}
          </button>
          <Link to="/" className="block text-center text-xs text-ink-faint hover:underline">
            Voltar para a página inicial
          </Link>
        </div>
      </div>
    </div>
  );
}
