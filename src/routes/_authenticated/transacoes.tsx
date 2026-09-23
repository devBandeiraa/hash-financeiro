import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { BadgeOrigem } from "@/components/ia/badge-ia";
import { SugestoesIa } from "@/components/ia/sugestoes-ia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  atualizarCategoriaTransacao,
  contarTransacoesImportadas,
  excluirTransacoesImportadas,
  listarCategorias,
  listarTransacoes,
} from "@/lib/hash-financeiro.functions";
import { formatarBRL, formatarData } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transacoes")({
  component: Transacoes,
});

const SEM_CATEGORIA = "sem-categoria";

function Transacoes() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(listarTransacoes);
  const buscarCategorias = useServerFn(listarCategorias);
  const atualizar = useServerFn(atualizarCategoriaTransacao);
  const contarImportadas = useServerFn(contarTransacoesImportadas);
  const limparImportadas = useServerFn(excluirTransacoesImportadas);

  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [busca, setBusca] = useState("");

  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: () => buscarCategorias({}),
  });

  const transacoes = useQuery({
    queryKey: ["transacoes", mes, busca],
    queryFn: () => buscar({ data: { mes, ...(busca ? { busca } : {}) } }),
  });

  const totalImportadas = useQuery({
    queryKey: ["transacoes-importadas-total"],
    queryFn: () => contarImportadas({}),
  });

  const mudarCategoria = useMutation({
    mutationFn: (vars: { id: string; categoriaId: string | null }) => atualizar({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["resumo"] });
    },
    onError: () => toast.error("Não foi possível atualizar a categoria."),
  });

  const limparImportacoes = useMutation({
    mutationFn: () => limparImportadas({}),
    onSuccess: ({ apagadas }) => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes-importadas-total"] });
      queryClient.invalidateQueries({ queryKey: ["resumo"] });
      toast.success(`${apagadas} transação(ões) importada(s) apagada(s).`);
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não foi possível apagar as importações."),
  });

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Livro-razão</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Transações</h1>
          <p className="mt-1 text-[13px] text-ink-faint">
            Corrija a categoria de qualquer lançamento — a mudança reflete no dashboard.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Input
            placeholder="Buscar descrição"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-52"
          />
          <Input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="w-44"
            aria-label="Mês"
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={!totalImportadas.data?.total || limparImportacoes.isPending}
              >
                Limpar importações
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar todas as transações importadas?</AlertDialogTitle>
                <AlertDialogDescription>
                  {totalImportadas.data?.total ?? 0} transação(ões) vinda(s) de CSV ou PDF serão
                  apagadas permanentemente, de todos os meses. Lançamentos manuais e regras de
                  categorização não são afetados. Não há como desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => limparImportacoes.mutate()}>
                  Apagar definitivamente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="mb-6">
        <SugestoesIa delay={40} />
      </div>

      <div className="panel hairline-top stage overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead className="eyebrow w-28">Data</TableHead>
              <TableHead className="eyebrow">Descrição</TableHead>
              <TableHead className="eyebrow w-28">Tipo</TableHead>
              <TableHead className="eyebrow w-32 text-right">Valor</TableHead>
              <TableHead className="eyebrow w-56">Categoria</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transacoes.isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-ink-faint">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : (transacoes.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-ink-faint">
                  Nenhuma transação para este filtro.
                </TableCell>
              </TableRow>
            ) : (
              (transacoes.data ?? []).map((t) => (
                <TableRow key={t.id} className="border-hairline">
                  <TableCell className="num text-ink-faint">{formatarData(t.data)}</TableCell>
                  <TableCell className="max-w-xs truncate">{t.descricao}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        t.tipo === "DEBITO" ? "bg-ember/10 text-ember" : "bg-mint/10 text-mint"
                      }`}
                    >
                      {t.tipo === "DEBITO" ? "saída" : "entrada"}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`num text-right ${t.tipo === "DEBITO" ? "text-ember" : "text-mint"}`}
                  >
                    {t.tipo === "DEBITO" ? "-" : "+"}
                    {formatarBRL(t.valor)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={t.categoriaId ?? SEM_CATEGORIA}
                        onValueChange={(v) =>
                          mudarCategoria.mutate({
                            id: t.id,
                            categoriaId: v === SEM_CATEGORIA ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8" aria-label="Categoria">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_CATEGORIA}>Não categorizado</SelectItem>
                          {(categorias.data ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {t.categoriaId ? <BadgeOrigem origem={t.categoriaOrigem} /> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
