import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lerEventos } from "@/lib/agente/fluxo";
import { confirmarAcaoAgente } from "@/lib/hash-financeiro.functions";
import type { TurnoConversa } from "@/lib/ai/modelo.server";

interface Proposta {
  id: string;
  nome: string;
  descricao: string;
  args: Record<string, unknown>;
  situacao: "aberta" | "confirmada" | "descartada";
}

interface Bolha {
  papel: "usuario" | "agente";
  texto: string;
  ferramentas: string[];
  propostas: Proposta[];
  erro?: string;
}

const SUGESTOES = [
  "Quanto gastei esse mês?",
  "Quais foram meus 5 maiores gastos?",
  "Cria uma regra pra Uber virar Transporte",
];

export function ChatAgente() {
  const queryClient = useQueryClient();
  const confirmar = useServerFn(confirmarAcaoAgente);

  const [bolhas, setBolhas] = useState<Bolha[]>([]);
  const [historico, setHistorico] = useState<TurnoConversa[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const abortar = useRef<AbortController | null>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [bolhas, pensando]);

  // Cancela o streaming em curso se a tela for desmontada.
  useEffect(() => () => abortar.current?.abort(), []);

  /** Atualiza a última bolha do agente sem recriar a lista inteira. */
  function atualizarUltima(mudar: (b: Bolha) => Bolha) {
    setBolhas((atuais) => {
      const copia = [...atuais];
      const ultima = copia[copia.length - 1];
      if (ultima) copia[copia.length - 1] = mudar(ultima);
      return copia;
    });
  }

  async function enviar(mensagem: string) {
    const texto = mensagem.trim();
    if (!texto || pensando) return;

    setEntrada("");
    setPensando(true);
    setBolhas((b) => [
      ...b,
      { papel: "usuario", texto, ferramentas: [], propostas: [] },
      { papel: "agente", texto: "", ferramentas: [], propostas: [] },
    ]);

    const controlador = new AbortController();
    abortar.current = controlador;

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");

      const resposta = await fetch("/api/agente/chat", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ mensagem: texto, historico }),
        signal: controlador.signal,
      });

      if (!resposta.ok || !resposta.body) {
        const erro = (await resposta.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(erro?.erro ?? "O assistente não respondeu.");
      }

      for await (const evento of lerEventos(resposta.body)) {
        if (evento.tipo === "texto") {
          atualizarUltima((b) => ({ ...b, texto: b.texto + evento.conteudo }));
        } else if (evento.tipo === "ferramenta") {
          atualizarUltima((b) => ({ ...b, ferramentas: [...b.ferramentas, evento.nome] }));
        } else if (evento.tipo === "proposta") {
          atualizarUltima((b) => ({
            ...b,
            propostas: [
              ...b.propostas,
              {
                id: evento.id,
                nome: evento.nome,
                descricao: evento.descricao,
                args: evento.args,
                situacao: "aberta",
              },
            ],
          }));
        } else if (evento.tipo === "fim") {
          setHistorico(evento.historico);
        } else if (evento.tipo === "erro") {
          atualizarUltima((b) => ({ ...b, erro: evento.mensagem }));
        }
      }
    } catch (erro) {
      if (controlador.signal.aborted) return;
      atualizarUltima((b) => ({
        ...b,
        erro: erro instanceof Error ? erro.message : "Falha ao falar com o assistente.",
      }));
    } finally {
      setPensando(false);
      abortar.current = null;
    }
  }

  async function decidir(proposta: Proposta, aceitar: boolean) {
    if (!aceitar) {
      marcar(proposta.id, "descartada");
      return;
    }
    try {
      const r = await confirmar({ data: { nome: proposta.nome, args: proposta.args } });
      marcar(proposta.id, "confirmada");
      // O modelo recebeu "pendente" quando propôs; sem este aviso, num próximo
      // turno ele ainda acharia que a ação não foi executada.
      setHistorico((h) => [
        ...h,
        { papel: "usuario", texto: `[sistema] Ação confirmada e executada: ${r.descricao}` },
      ]);
      queryClient.invalidateQueries();
      toast.success("Ação executada.");
    } catch {
      toast.error("Não foi possível executar a ação.");
    }
  }

  function marcar(id: string, situacao: Proposta["situacao"]) {
    setBolhas((atuais) =>
      atuais.map((b) => ({
        ...b,
        propostas: b.propostas.map((p) => (p.id === id ? { ...p, situacao } : p)),
      })),
    );
  }

  return (
    <div className="panel hairline-top stage flex h-[70vh] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
        {bolhas.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="size-7 text-signal" aria-hidden />
            <div>
              <p className="font-display text-lg font-semibold">Pergunte sobre suas finanças</p>
              <p className="mt-1 max-w-md text-[13px] text-ink-faint">
                O assistente consulta seus dados com ferramentas — não inventa números. Ações que
                alteram dados viram propostas para você confirmar.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => void enviar(s)}
                  className="rounded-full border border-hairline px-3 py-1.5 text-xs text-ink-dim transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          bolhas.map((bolha, i) => (
            <div
              key={i}
              className={bolha.papel === "usuario" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  bolha.papel === "usuario"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-signal/10 px-4 py-2.5 text-sm"
                    : "max-w-[85%] space-y-2"
                }
              >
                {bolha.papel === "agente" && bolha.ferramentas.length > 0 ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                    <Sparkles className="size-3" aria-hidden />
                    consultou {bolha.ferramentas.join(", ")}
                  </p>
                ) : null}

                {bolha.texto ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{bolha.texto}</p>
                ) : null}

                {bolha.propostas.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-signal/40 bg-signal/5 p-3 text-sm"
                  >
                    <p className="eyebrow">Precisa da sua confirmação</p>
                    <p className="mt-1">{p.descricao}</p>
                    {p.situacao === "aberta" ? (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => void decidir(p, true)}>
                          <Check className="size-3.5" aria-hidden />
                          Confirmar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void decidir(p, false)}>
                          <X className="size-3.5" aria-hidden />
                          Descartar
                        </Button>
                      </div>
                    ) : (
                      <p
                        className={`mt-2 text-xs ${p.situacao === "confirmada" ? "text-mint" : "text-ink-faint"}`}
                      >
                        {p.situacao === "confirmada" ? "Executada." : "Descartada."}
                      </p>
                    )}
                  </div>
                ))}

                {bolha.erro ? (
                  <p className="rounded-lg border border-ember/40 bg-ember/5 p-3 text-xs text-ink-dim">
                    {bolha.erro}
                  </p>
                ) : null}
              </div>
            </div>
          ))
        )}

        {pensando ? (
          <p className="flex items-center gap-2 text-xs text-ink-faint">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            pensando…
          </p>
        ) : null}
        <div ref={fim} />
      </div>

      <form
        className="flex gap-2 border-t border-hairline p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(entrada);
        }}
      >
        <Input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="Quanto gastei com alimentação em julho?"
          maxLength={2000}
          disabled={pensando}
          aria-label="Mensagem"
        />
        <Button type="submit" disabled={pensando || !entrada.trim()}>
          <Send className="size-3.5" aria-hidden />
          Enviar
        </Button>
      </form>
    </div>
  );
}
