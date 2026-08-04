import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SilkBackground } from "@/components/silk-background";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";


const links = [
  { to: "/dashboard", rotulo: "Dashboard" },
  { to: "/importar", rotulo: "Importar" },
  { to: "/transacoes", rotulo: "Transações" },
  { to: "/regras", rotulo: "Regras" },
  { to: "/privacidade", rotulo: "Privacidade" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="relative min-h-screen bg-background">
      <SilkBackground fixed />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-background/55 via-background/88 to-background" />

      <div className="relative">
        <header className="sticky top-0 z-30 border-b border-hairline bg-surface/92 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link to="/dashboard" className="min-w-0">
              <span className="eyebrow block">Gestor financeiro</span>
              <span className="font-display text-[1.05rem] font-bold tracking-tight text-foreground">
                Hash Financeiro
              </span>
            </Link>
            <nav className="flex flex-1 flex-wrap gap-1">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-faint transition-colors hover:bg-secondary hover:text-foreground",
                    caminho === l.to && "bg-signal/10 text-signal",
                  )}
                >
                  {l.rotulo}
                </Link>
              ))}
            </nav>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={sair}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

