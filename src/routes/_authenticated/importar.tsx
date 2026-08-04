import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

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
  analisarExtrato,
  criarConta,
  importarExtrato,
  listarContas,
} from "@/lib/hash-financeiro.functions";
import type { PreviaImportacao, ResultadoImportacao, TipoConta } from "@/lib/types/dominio";

export const Route = createFileRoute("/_authenticated/importar")({
  component: Importar,
});

const LIMITE_BYTES = 3 * 1024 * 1024;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (iso: string) => iso.split("-").reverse().join("/");

function Importar() {
  const queryClient = useQueryClient();
  const buscarContas = useServerFn(listarContas);
  const novaConta = useServerFn(criarConta);
  const analisar = useServerFn(analisarExtrato);
  const importar = useServerFn(importarExtrato);

  const [contaId, setContaId] = useState<string>("");
  const [nomeConta, setNomeConta] = useState("");
  const [tipoConta, setTipoConta] = useState<TipoConta>("CORRENTE");
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [pendente, setPendente] = useState<{ conteudo: string; formato: "CSV" | "OFX" } | null>(
    null,
  );
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const contas = useQuery({ queryKey: ["contas"], queryFn: () => buscarContas({}) });

  const criar = useMutation({
    mutationFn: () => novaConta({ data: { nome: nomeConta.trim(), tipo: tipoConta } }),
    onSuccess: (conta) => {
      setNomeConta("");
      setContaId(conta.id);
      queryClient.invalidateQueries({ queryKey: ["contas"] });
      toast.success("Conta criada.");
    },
    onError: () => toast.error("Não foi possível criar a conta."),
  });

  function limparArquivo() {
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  function descartar() {
    setPrevia(null);
    setPendente(null);
    limparArquivo();
  }

  const preparar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (arquivo.size > LIMITE_BYTES) throw new Error("Arquivo maior que 3 MB.");
      const nome = arquivo.name.toLowerCase();
      const formato = nome.endsWith(".ofx") ? "OFX" : "CSV";
      const conteudo = await arquivo.text();
      const p = await analisar({ data: { contaId, conteudo, formato } });
      return { previa: p, conteudo, formato } as const;
    },
    onSuccess: ({ previa: p, conteudo, formato }) => {
      setResultado(null);
      setPrevia(p);
      setPendente({ conteudo, formato });
    },
    onError: (erro) => {
      descartar();
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ler o arquivo.");
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      if (!pendente) throw new Error("Nenhum arquivo em prévia.");
      return importar({ data: { contaId, ...pendente } });
    },
    onSuccess: (r) => {
      setResultado(r);
      descartar();
      queryClient.invalidateQueries({ queryKey: ["resumo"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      toast.success(`${r.importadas} transações importadas.`);
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Falha ao importar o arquivo."),
  });

  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow">Entrada de dados</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Importar extrato</h1>
        <p className="mt-1 text-[13px] text-ink-faint">
          CSV ou OFX. O arquivo é processado em memória: nada é armazenado além das transações.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          eyebrow="Passo 1"
          title="Escolha a conta"
          subtitle="Cada extrato pertence a uma conta bancária."
          delay={40}
        >
          <div className="space-y-4">
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger aria-label="Conta">
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {(contas.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} · {c.tipo.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2 rounded-lg border border-dashed border-hairline bg-surface-raised p-4">
              <Label htmlFor="nova-conta" className="eyebrow">
                Criar nova conta
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="nova-conta"
                  placeholder="Ex.: Nubank"
                  value={nomeConta}
                  onChange={(e) => setNomeConta(e.target.value)}
                  className="flex-1 min-w-40"
                />
                <Select value={tipoConta} onValueChange={(v) => setTipoConta(v as TipoConta)}>
                  <SelectTrigger className="w-36" aria-label="Tipo de conta">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CORRENTE">Corrente</SelectItem>
                    <SelectItem value="POUPANCA">Poupança</SelectItem>
                    <SelectItem value="CARTAO">Cartão</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => criar.mutate()}
                  disabled={!nomeConta.trim() || criar.isPending}
                >
                  Criar
                </Button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Passo 2"
          title="Envie o arquivo"
          subtitle="Colunas aceitas: data, descrição/histórico e valor (CSV com , ou ;). Nada é gravado antes de você confirmar."
          delay={100}
        >
          <div className="space-y-4">
            <Input
              ref={inputArquivo}
              type="file"
              accept=".csv,.txt,.ofx"
              disabled={!contaId || preparar.isPending || enviar.isPending}
              aria-label="Arquivo de extrato"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) preparar.mutate(arquivo);
              }}
            />
            {!contaId ? (
              <p className="text-xs text-ink-faint">Selecione uma conta primeiro.</p>
            ) : null}
            {preparar.isPending ? (
              <p className="text-sm text-signal">Analisando o arquivo…</p>
            ) : null}

            {resultado ? (
              <div className="space-y-2 rounded-lg border border-hairline bg-surface-raised p-4 text-sm">
                <p>
                  <strong className="num text-mint">{resultado.importadas}</strong> importadas ·{" "}
                  <strong className="num">{resultado.ignoradasDuplicadas}</strong> duplicadas
                  ignoradas · <strong className="num">{resultado.invalidas.length}</strong>{" "}
                  inválidas
                </p>
                {resultado.invalidas.length > 0 ? (
                  <ul className="max-h-40 space-y-1 overflow-auto text-xs text-ink-faint">
                    {resultado.invalidas.slice(0, 20).map((i) => (
                      <li key={i.linha}>
                        linha {i.linha}: {i.motivo}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>

        {previa ? (
          <Panel
            eyebrow="Passo 3 · dry-run"
            title="Confira antes de confirmar"
            subtitle={`Prévia do arquivo ${previa.formato}${
              previa.periodo
                ? ` · ${dataCurta(previa.periodo.de)} a ${dataCurta(previa.periodo.ate)}`
                : ""
            }. Nada foi gravado ainda.`}
            delay={160}
            className="lg:col-span-2"
          >
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { rotulo: "Linhas lidas", valor: previa.linhasLidas, cor: "text-foreground" },
                  { rotulo: "Serão importadas", valor: previa.aImportar, cor: "text-mint" },
                  {
                    rotulo: "Duplicadas no arquivo",
                    valor: previa.duplicadasNoArquivo,
                    cor: "text-ink-dim",
                  },
                  { rotulo: "Já existem na conta", valor: previa.jaExistentes, cor: "text-ink-dim" },
                  { rotulo: "Linhas inválidas", valor: previa.invalidas.length, cor: "text-ember" },
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

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-hairline p-4 text-sm">
                  <p className="eyebrow">Impacto estimado</p>
                  <p className="mt-2 text-ink-dim">
                    Entradas <span className="num text-mint">{moeda.format(previa.totais.entradas)}</span>{" "}
                    · Saídas{" "}
                    <span className="num text-ember">{moeda.format(previa.totais.saidas)}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {previa.semCategoria} lançamento(s) ficarão sem categoria.
                  </p>
                  {previa.porCategoria.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-xs">
                      {previa.porCategoria.slice(0, 6).map((c) => (
                        <li key={c.nome} className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: c.cor }}
                            aria-hidden
                          />
                          <span className="flex-1">{c.nome}</span>
                          <span className="num text-ink-faint">{c.quantidade}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="rounded-lg border border-hairline p-4 text-sm">
                  <p className="eyebrow">Primeiras linhas</p>
                  <ul className="mt-2 space-y-2 text-xs">
                    {previa.amostra.map((l, i) => (
                      <li key={`${l.data}-${i}`} className="flex flex-wrap items-baseline gap-2">
                        <span className="num text-ink-faint">{dataCurta(l.data)}</span>
                        <span className="flex-1 truncate">{l.descricao}</span>
                        <span className={`num ${l.tipo === "DEBITO" ? "text-ember" : "text-mint"}`}>
                          {l.tipo === "DEBITO" ? "−" : "+"}
                          {moeda.format(l.valor)}
                        </span>
                        <span className="text-ink-faint">
                          {l.categoria ?? "sem categoria"}
                          {l.situacao === "DUPLICADA" ? " · já existe" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {previa.invalidas.length > 0 ? (
                <div className="rounded-lg border border-ember/40 bg-ember/5 p-4">
                  <p className="eyebrow">Linhas que serão ignoradas</p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-ink-dim">
                    {previa.invalidas.slice(0, 20).map((i) => (
                      <li key={i.linha}>
                        linha {i.linha}: {i.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => enviar.mutate()}
                  disabled={enviar.isPending || previa.aImportar === 0}
                >
                  {enviar.isPending
                    ? "Importando…"
                    : `Confirmar import de ${previa.aImportar} lançamento(s)`}
                </Button>
                <Button variant="outline" onClick={descartar} disabled={enviar.isPending}>
                  Descartar
                </Button>
              </div>
              {previa.aImportar === 0 ? (
                <p className="text-xs text-ink-faint">
                  Nada novo para importar: todos os lançamentos já estão nesta conta ou são
                  inválidos.
                </p>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
