import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

import { Panel } from "@/components/cfo/Panel";
import { Button } from "@/components/ui/button";
import { insightMensal } from "@/lib/hash-financeiro.functions";
import { formatarBRL } from "@/lib/format";
import type { InsightMensal, TotalCategoria } from "@/lib/types/dominio";

/** "+26,6%" / "−9,5%" / "—" quando não havia base de comparação. */
function variacaoTexto(pct: number | null): string {
  if (pct === null) return "—";
  const sinal = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sinal}${Math.abs(pct).toFixed(1).replace(".", ",")}%`;
}

function corVariacao(pct: number | null): string {
  if (pct === null) return "text-ink-faint";
  // Gasto subindo é ruim; caindo é bom. O oposto do dashboard de saldo.
  return pct > 0 ? "text-ember" : pct < 0 ? "text-mint" : "text-ink-faint";
}

export function PainelInsight({ mes, delay = 0 }: { mes: string; delay?: number }) {
  const gerar = useServerFn(insightMensal);
  const [dados, setDados] = useState<InsightMensal | null>(null);

  const consultar = useMutation({
    mutationFn: (forcar: boolean) => gerar({ data: { mes, forcar } }),
    onSuccess: setDados,
  });

  // Um efeito, e não useQuery, porque a geração pode chamar o modelo: quem
  // dispara é a troca de mês, nunca um refetch automático em background.
  const { mutate } = consultar;
  useEffect(() => {
    setDados(null);
    mutate(false);
  }, [mes, mutate]);

  const agregado = dados?.agregado;

  return (
    <Panel
      eyebrow="Análise"
      title="Resumo do mês"
      subtitle="Texto gerado a partir apenas de totais agregados — nenhuma transação individual sai do sistema."
      delay={delay}
      className="lg:col-span-2"
      aside={
        <Button
          variant="outline"
          size="sm"
          onClick={() => consultar.mutate(true)}
          disabled={consultar.isPending}
          title="Gerar de novo, ignorando o cache"
        >
          <RefreshCw
            className={`size-3.5 ${consultar.isPending ? "animate-spin" : ""}`}
            aria-hidden
          />
          Atualizar
        </Button>
      }
    >
      {consultar.isPending && !dados ? (
        <p className="text-sm text-signal">Analisando os números do mês…</p>
      ) : consultar.isError ? (
        <p className="text-sm text-ember">Não foi possível gerar o resumo.</p>
      ) : !agregado ? (
        <p className="text-sm text-ink-faint">Sem dados para este mês.</p>
      ) : (
        <div className="space-y-4">
          {dados?.texto ? (
            <div className="rounded-lg border border-signal/30 bg-signal/5 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-signal">
                <Sparkles className="size-3" aria-hidden />
                GERADO POR IA
              </p>
              <p className="text-sm leading-relaxed">{dados.texto}</p>
              {dados.doCache ? (
                <p className="mt-2 text-[11px] text-ink-faint">
                  {dados.iaDisponivel
                    ? "Do cache — os números não mudaram desde a última geração."
                    : "IA indisponível: mostrando o último resumo gerado."}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-hairline bg-surface-raised p-4 text-sm">
              {dados?.iaDisponivel === false ? (
                <>
                  <p className="font-medium">Resumo por IA indisponível.</p>
                  <p className="mt-1 text-xs text-ink-dim">
                    Os números abaixo continuam corretos — eles vêm do banco, não do modelo.
                  </p>
                </>
              ) : (
                <p className="text-ink-faint">
                  Sem movimentação suficiente neste mês para gerar um resumo.
                </p>
              )}
            </div>
          )}

          {/* Os números que embasam o texto. Resumo sem eles seria pedir fé no modelo. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-hairline bg-surface-raised p-3">
              <p className="eyebrow">Saídas no mês</p>
              <p className="num mt-1 text-xl font-semibold text-ember">
                {formatarBRL(agregado.totalSaidas)}
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface-raised p-3">
              <p className="eyebrow">Mês anterior</p>
              <p className="num mt-1 text-xl font-semibold text-ink-dim">
                {formatarBRL(agregado.totalSaidasAnterior)}
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface-raised p-3">
              <p className="eyebrow">Variação</p>
              <p
                className={`num mt-1 text-xl font-semibold ${corVariacao(agregado.variacaoTotalPct)}`}
              >
                {variacaoTexto(agregado.variacaoTotalPct)}
              </p>
            </div>
          </div>

          {agregado.porCategoria.length > 0 ? (
            <ul className="divide-y divide-hairline rounded-lg border border-hairline text-sm">
              {agregado.porCategoria.map((c: TotalCategoria) => (
                <li key={c.categoria} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{c.categoria}</span>
                  <span className="num text-ink-faint">{formatarBRL(c.total)}</span>
                  <span className={`num w-20 text-right text-xs ${corVariacao(c.variacaoPct)}`}>
                    {variacaoTexto(c.variacaoPct)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {agregado.categoriasQueSumiram.length > 0 ? (
            <p className="text-xs text-ink-faint">
              Sem gasto neste mês, mas havia no anterior: {agregado.categoriasQueSumiram.join(", ")}
              .
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
