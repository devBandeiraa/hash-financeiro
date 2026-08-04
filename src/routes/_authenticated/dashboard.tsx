import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Panel } from "@/components/cfo/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resumoDashboard, reclassificarTudo } from "@/lib/hash-financeiro.functions";
import { formatarBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

function Dashboard() {
  const [mes, setMes] = useState(mesAtual);
  const buscarResumo = useServerFn(resumoDashboard);
  const reclassificar = useServerFn(reclassificarTudo);
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["resumo", mes],
    queryFn: () => buscarResumo({ data: { mes } }),
  });

  const mutacao = useMutation({
    mutationFn: () => reclassificar({}),
    onSuccess: (r) => {
      toast.success(`${r.atualizadas} transações reclassificadas.`);
      queryClient.invalidateQueries();
    },
    onError: () => toast.error("Não foi possível reclassificar."),
  });

  const pizza = useMemo(() => (data?.porCategoria ?? []).slice(0, 8), [data]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Visão do mês</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[13px] text-ink-faint">Para onde foi o seu dinheiro no mês.</p>
        </div>
        <div className="flex items-end gap-2">
          <Input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value || mesAtual())}
            className="w-44"
            aria-label="Mês de referência"
          />
          <Button variant="outline" onClick={() => mutacao.mutate()} disabled={mutacao.isPending}>
            Reclassificar
          </Button>
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-ink-faint">Carregando…</p>
      ) : !data ? (
        <p className="text-sm text-ink-faint">Sem dados.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador titulo="Entradas" valor={formatarBRL(data.totalEntradas)} tom="mint" />
            <Indicador titulo="Saídas" valor={formatarBRL(data.totalSaidas)} tom="ember" />
            <Indicador titulo="Saldo" valor={formatarBRL(data.saldo)} tom="signal" />
            <Indicador
              titulo="Lançamentos"
              valor={`${data.totalTransacoes}`}
              rodape={`${data.naoCategorizadas} sem categoria`}
            />
          </div>

          {data.totalTransacoes === 0 ? (
            <div className="panel hairline-top py-10 text-center text-sm text-ink-faint">
              Nenhuma transação neste mês. Importe um extrato para começar.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel
                eyebrow="Distribuição"
                title="Gastos por categoria"
                delay={60}
                bodyClassName="h-72 p-5 pt-0 sm:p-6 sm:pt-0"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pizza}
                      dataKey="total"
                      nameKey="nome"
                      innerRadius={55}
                      outerRadius={95}
                    >
                      {pizza.map((fatia) => (
                        <Cell key={fatia.nome} fill={fatia.cor} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatarBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </Panel>

              <Panel
                eyebrow="Série diária"
                title="Saídas por dia"
                delay={120}
                bodyClassName="h-72 p-5 pt-0 sm:p-6 sm:pt-0"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.serieDiaria}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--grid-line)"
                    />
                    <XAxis
                      dataKey="data"
                      tickFormatter={(d: string) => d.slice(8)}
                      fontSize={12}
                      stroke="var(--axis-line)"
                    />
                    <YAxis fontSize={12} width={60} stroke="var(--axis-line)" />
                    <Tooltip formatter={(v: number) => formatarBRL(v)} />
                    <Bar dataKey="saidas" fill="var(--ember)" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              <Panel
                eyebrow="Ranking"
                title="Categorias com maior peso"
                delay={180}
                className="lg:col-span-2"
              >
                <div className="space-y-3">
                  {data.porCategoria.map((linha) => {
                    const pct = data.totalSaidas ? (linha.total / data.totalSaidas) * 100 : 0;
                    return (
                      <div key={linha.nome} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: linha.cor }}
                            />
                            {linha.nome}
                          </span>
                          <span className="num text-ink-faint">
                            {formatarBRL(linha.total)} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: linha.cor }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Indicador({
  titulo,
  valor,
  rodape,
  tom,
}: {
  titulo: string;
  valor: string;
  rodape?: string;
  tom?: "signal" | "ember" | "mint";
}) {
  const cor =
    tom === "ember"
      ? "text-ember"
      : tom === "mint"
        ? "text-mint"
        : tom === "signal"
          ? "text-signal"
          : "text-foreground";
  return (
    <div className="panel hairline-top stage px-5 py-5">
      <p className="eyebrow">{titulo}</p>
      <p className={`num mt-2 text-2xl font-semibold ${cor}`}>{valor}</p>
      {rodape ? <p className="mt-1 text-[11px] text-ink-faint">{rodape}</p> : null}
    </div>
  );
}
