import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/cfo/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  criarRegra,
  excluirRegra,
  listarCategorias,
  listarRegras,
  reclassificarTudo,
} from "@/lib/hash-financeiro.functions";

export const Route = createFileRoute("/_authenticated/regras")({
  component: Regras,
});

function Regras() {
  const queryClient = useQueryClient();
  const buscarRegras = useServerFn(listarRegras);
  const buscarCategorias = useServerFn(listarCategorias);
  const criar = useServerFn(criarRegra);
  const excluir = useServerFn(excluirRegra);
  const reclassificar = useServerFn(reclassificarTudo);

  const [palavra, setPalavra] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  const regras = useQuery({ queryKey: ["regras"], queryFn: () => buscarRegras({}) });
  const categorias = useQuery({ queryKey: ["categorias"], queryFn: () => buscarCategorias({}) });

  const nomeCategoria = (id: string) => categorias.data?.find((c) => c.id === id)?.nome ?? "—";

  const adicionar = useMutation({
    mutationFn: () =>
      criar({ data: { palavraChave: palavra.trim(), categoriaId, prioridade: 10 } }),
    onSuccess: async () => {
      setPalavra("");
      queryClient.invalidateQueries({ queryKey: ["regras"] });
      const r = await reclassificar({});
      toast.success(`Regra criada. ${r.atualizadas} transações reclassificadas.`);
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["resumo"] });
    },
    onError: () => toast.error("Não foi possível criar a regra."),
  });

  const remover = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regras"] }),
    onError: () => toast.error("Só é possível excluir regras suas."),
  });

  const minhas = (regras.data ?? []).filter((r) => r.usuarioId !== null);
  const padrao = (regras.data ?? []).filter((r) => r.usuarioId === null);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow">Motor determinístico</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Regras de categorização</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-faint">
          A primeira palavra-chave que casa com a descrição define a categoria. Suas regras vencem
          as do sistema.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Panel
          eyebrow="Nova regra"
          title="Palavra-chave → categoria"
          subtitle='Ex.: "IFOOD" → Alimentação'
          delay={40}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="palavra" className="eyebrow">
                Palavra-chave
              </Label>
              <Input
                id="palavra"
                value={palavra}
                onChange={(e) => setPalavra(e.target.value)}
                placeholder="IFOOD"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="eyebrow">Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger aria-label="Categoria da regra">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(categorias.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={palavra.trim().length < 2 || !categoriaId || adicionar.isPending}
              onClick={() => adicionar.mutate()}
            >
              Criar e reclassificar
            </Button>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel eyebrow="Suas regras" title={`Minhas regras (${minhas.length})`} delay={100}>
            <div className="space-y-2">
              {minhas.length === 0 ? (
                <p className="text-sm text-ink-faint">Nenhuma regra própria ainda.</p>
              ) : (
                minhas.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-md border border-hairline bg-surface-raised px-3 py-2 text-sm"
                  >
                    <span className="num text-signal">{r.palavraChave}</span>
                    <span className="text-ink-faint">→</span>
                    <span className="flex-1 text-ink-dim">{nomeCategoria(r.categoriaId)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remover.mutate(r.id)}
                      aria-label={`Excluir regra ${r.palavraChave}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel
            eyebrow="Fallback"
            title={`Regras do sistema (${padrao.length})`}
            subtitle="Aplicadas quando nenhuma regra sua casa."
            delay={160}
          >
            <div className="flex flex-wrap gap-2">
              {padrao.map((r) => (
                <span
                  key={r.id}
                  className="rounded-md border border-hairline bg-surface-raised px-2 py-1 text-[11px] text-ink-dim"
                >
                  <span className="num text-foreground">{r.palavraChave}</span> →{" "}
                  {nomeCategoria(r.categoriaId)}
                </span>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
