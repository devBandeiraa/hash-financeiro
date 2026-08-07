import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Panel } from "@/components/cfo/Panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { aplicarSugestoesIa, sugerirCategoriasPorIa } from "@/lib/hash-financeiro.functions";
import type { PreviaSugestoesIa } from "@/lib/types/dominio";

/**
 * Dry-run da categorização por IA — mesma filosofia do import: a IA propõe,
 * o usuário confirma. Nada é gravado enquanto esta tela está aberta.
 */
export function SugestoesIa({ delay = 0 }: { delay?: number }) {
  const queryClient = useQueryClient();
  const sugerir = useServerFn(sugerirCategoriasPorIa);
  const aplicar = useServerFn(aplicarSugestoesIa);

  const [previa, setPrevia] = useState<PreviaSugestoesIa | null>(null);
  const [recusadas, setRecusadas] = useState<Set<string>>(new Set());
  /** Descrições em que o usuário optou por aplicar sem criar regra. */
  const [semRegra, setSemRegra] = useState<Set<string>>(new Set());

  const pedirSugestoes = useMutation({
    mutationFn: () => sugerir({}),
    onSuccess: (p) => {
      setPrevia(p);
      setRecusadas(new Set());
      setSemRegra(new Set());
    },
    onError: () => toast.error("Não foi possível consultar a IA."),
  });

  const confirmar = useMutation({
    mutationFn: () => {
      const aceitas = (previa?.sugestoes ?? [])
        .filter((s) => !recusadas.has(s.descricao))
        .map((s) => ({
          descricao: s.descricao,
          categoriaId: s.categoriaId,
          criarRegra: Boolean(s.palavraChave) && !semRegra.has(s.descricao),
        }));
      return aplicar({ data: { aceitas } });
    },
    onSuccess: (r) => {
      setPrevia(null);
      queryClient.invalidateQueries();
      toast.success(
        `${r.transacoesAtualizadas} lançamento(s) categorizado(s) · ` +
          `${r.regrasCriadas} regra(s) criada(s), ${r.regrasAtualizadas} atualizada(s).`,
      );
    },
    onError: () => toast.error("Não foi possível aplicar as sugestões."),
  });

  const alternar = (conjunto: Set<string>, chave: string) => {
    const novo = new Set(conjunto);
    if (novo.has(chave)) novo.delete(chave);
    else novo.add(chave);
    return novo;
  };

  const aceitasCount = (previa?.sugestoes ?? []).filter((s) => !recusadas.has(s.descricao)).length;
  const regrasCount = (previa?.sugestoes ?? []).filter(
    (s) => !recusadas.has(s.descricao) && s.palavraChave && !semRegra.has(s.descricao),
  ).length;

  return (
    <Panel
      eyebrow="Fallback"
      title="Categorizar o que sobrou com IA"
      subtitle="O motor de regras roda primeiro. A IA só olha o que ficou sem categoria — e nada é gravado sem a sua confirmação."
      delay={delay}
      className="lg:col-span-2"
      aside={
        previa ? null : (
          <Button
            variant="outline"
            onClick={() => pedirSugestoes.mutate()}
            disabled={pedirSugestoes.isPending}
          >
            <Sparkles className="size-3.5" aria-hidden />
            {pedirSugestoes.isPending ? "Consultando…" : "Sugerir com IA"}
          </Button>
        )
      }
    >
      {pedirSugestoes.isPending ? (
        <p className="text-sm text-signal">Analisando as descrições sem categoria…</p>
      ) : !previa ? (
        <p className="text-sm text-ink-faint">
          Nada foi enviado ainda. Ao consultar, só as <strong>descrições</strong> dos lançamentos
          sem categoria saem do sistema — nunca valor, saldo, conta ou titular.
        </p>
      ) : !previa.iaDisponivel ? (
        <div className="rounded-lg border border-ember/40 bg-ember/5 p-4 text-sm">
          <p className="font-medium">IA indisponível no momento.</p>
          <p className="mt-1 text-xs text-ink-dim">
            O sistema segue funcionando normalmente: o motor determinístico de regras não depende de
            IA. Você também pode corrigir as categorias à mão na tela de transações.
          </p>
        </div>
      ) : previa.totalSemCategoria === 0 ? (
        <p className="text-sm text-ink-faint">
          Nenhum lançamento sem categoria. O motor de regras deu conta de tudo.
        </p>
      ) : previa.sugestoes.length === 0 ? (
        <p className="text-sm text-ink-faint">
          A IA analisou {previa.descricoesConsultadas} descrição(ões) e não teve confiança
          suficiente em nenhuma. Elas seguem sem categoria — é o comportamento esperado quando o
          modelo não sabe.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { rotulo: "Sem categoria", valor: previa.totalSemCategoria, cor: "text-ember" },
              {
                rotulo: "Consultadas",
                valor: previa.descricoesConsultadas,
                cor: "text-foreground",
              },
              { rotulo: "Sugestões", valor: previa.sugestoes.length, cor: "text-signal" },
            ].map((k) => (
              <div
                key={k.rotulo}
                className="rounded-lg border border-hairline bg-surface-raised p-3"
              >
                <p className="eyebrow">{k.rotulo}</p>
                <p className={`num mt-1 text-xl font-semibold ${k.cor}`}>{k.valor}</p>
              </div>
            ))}
          </div>

          <ul className="divide-y divide-hairline rounded-lg border border-hairline">
            {previa.sugestoes.map((s) => {
              const recusada = recusadas.has(s.descricao);
              return (
                <li
                  key={s.descricao}
                  className={`flex flex-wrap items-center gap-3 p-3 text-sm ${
                    recusada ? "opacity-40" : ""
                  }`}
                >
                  <Checkbox
                    checked={!recusada}
                    onCheckedChange={() => setRecusadas((r) => alternar(r, s.descricao))}
                    aria-label={`Aceitar sugestão para ${s.descricao}`}
                  />
                  <span className="min-w-0 flex-1 truncate" title={s.descricao}>
                    {s.descricao}
                  </span>
                  <span className="num text-xs text-ink-faint">{s.quantidade}×</span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: s.categoriaCor }}
                      aria-hidden
                    />
                    {s.categoriaNome}
                  </span>
                  <span className="w-full pl-9 text-xs text-ink-faint sm:w-auto sm:pl-0">
                    {s.palavraChave ? (
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <Checkbox
                          checked={!semRegra.has(s.descricao)}
                          disabled={recusada}
                          onCheckedChange={() => setSemRegra((r) => alternar(r, s.descricao))}
                          aria-label={`Criar regra para ${s.palavraChave}`}
                          className="size-3.5"
                        />
                        {s.regraExistente ? "atualizar regra" : "criar regra"}{" "}
                        <code className="rounded bg-secondary px-1">{s.palavraChave}</code>
                      </label>
                    ) : (
                      <span title="Descrição sem âncora confiável para virar regra">sem regra</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-ink-faint">
            Aceitar cria regras determinísticas: no próximo extrato, o motor pega esses lançamentos
            sozinho, sem chamar IA.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => confirmar.mutate()}
              disabled={confirmar.isPending || !aceitasCount}
            >
              {confirmar.isPending
                ? "Aplicando…"
                : `Confirmar ${aceitasCount} sugestão(ões) · ${regrasCount} regra(s)`}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPrevia(null)}
              disabled={confirmar.isPending}
            >
              Ignorar
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
