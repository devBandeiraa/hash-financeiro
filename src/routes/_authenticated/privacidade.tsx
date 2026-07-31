import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/cfo/Panel";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { excluirMinhaConta } from "@/lib/finpessoal.functions";

export const Route = createFileRoute("/_authenticated/privacidade")({
  component: Privacidade,
});

const praticas = [
  "Isolamento por usuário no próprio banco: cada linha carrega o dono e as políticas de acesso barram leitura cruzada.",
  "O extrato enviado é processado em memória e descartado — o arquivo nunca é armazenado.",
  "Nenhuma descrição, valor ou nome de arquivo aparece em log; registramos apenas contadores.",
  "Deduplicação por hash SHA-256 do lançamento, com unicidade garantida no banco.",
  "Toda leitura e escrita exige sessão autenticada; não há rota pública com dado financeiro.",
  "Segredos ficam apenas em variáveis de ambiente do servidor.",
];

function Privacidade() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const excluir = useServerFn(excluirMinhaConta);

  const apagar = useMutation({
    mutationFn: () => excluir({}),
    onSuccess: async () => {
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Todos os seus dados foram apagados.");
      navigate({ to: "/", replace: true });
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não foi possível apagar os dados."),
  });

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow">LGPD</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Privacidade e dados</h1>
        <p className="mt-1 text-[13px] text-ink-faint">
          Dado financeiro é dado sensível. Estas são as garantias do FinPessoal.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel eyebrow="Garantias" title="O que fazemos com seus dados" delay={40}>
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-dim">
            {praticas.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          eyebrow="Irreversível"
          title="Direito ao esquecimento"
          subtitle="Apaga transações, contas, categorias e regras suas, além da conta de acesso."
          delay={100}
          className="border-ember/40"
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={apagar.isPending}>
                Apagar todos os meus dados
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar tudo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Não há como desfazer. Sua conta e todo o histórico importado serão removidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => apagar.mutate()}>
                  Apagar definitivamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Panel>
      </div>
    </AppShell>
  );
}
