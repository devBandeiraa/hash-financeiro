import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  FileSpreadsheet,
  Fingerprint,
  Lock,
  ShieldCheck,
  Sparkles,
  Tags,
  Upload,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SilkBackground } from "@/components/silk-background";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hash Financeiro — do extrato ao dashboard em segundos" },
      {
        name: "description",
        content:
          "Importe o extrato do banco em CSV ou PDF, veja a prévia antes de confirmar, categorize tudo automaticamente e descubra para onde vai o seu dinheiro.",
      },
      { property: "og:title", content: "Hash Financeiro — do extrato ao dashboard em segundos" },
      {
        property: "og:description",
        content:
          "Importe o extrato em CSV ou PDF, categorize automaticamente e acompanhe seus gastos com privacidade por padrão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const vantagens = [
  {
    icone: FileSpreadsheet,
    titulo: "Importação que aguenta o extrato real",
    texto:
      "CSV com separador, colunas, datas e valores em formato brasileiro detectados sozinhos. PDF de extrato lido no seu navegador. Linha estranha vira relatório, não erro na sua cara.",
  },
  {
    icone: Sparkles,
    titulo: "Prévia antes de gravar",
    texto:
      "Um dry-run completo mostra quantas linhas entram, quantas são duplicadas, quais falharam e o impacto por categoria. Você confirma só depois de ver.",
  },
  {
    icone: Tags,
    titulo: "Categorização automática",
    texto:
      "Motor determinístico de palavras-chave com prioridade. Suas regras vencem as do sistema e reclassificam o histórico na hora — sem caixa-preta.",
  },
  {
    icone: BarChart3,
    titulo: "Dashboard que responde rápido",
    texto:
      "Entradas, saídas, saldo e ranking de categorias do mês. A pergunta “onde foi meu dinheiro?” resolvida em uma tela.",
  },
  {
    icone: Fingerprint,
    titulo: "Zero duplicata",
    texto:
      "Cada lançamento ganha um hash de deduplicação. Importe o mesmo extrato dez vezes: o saldo continua certo.",
  },
  {
    icone: Lock,
    titulo: "Privacidade por padrão",
    texto:
      "Isolamento por usuário no próprio banco, arquivo processado em memória, nenhum dado financeiro em log e exclusão total da conta em um clique.",
  },
] as const;

const passos = [
  {
    icone: Upload,
    titulo: "1 · Importe",
    texto: "Arraste o CSV ou PDF que o banco exporta. Nada de digitar lançamento a lançamento.",
  },
  {
    icone: Sparkles,
    titulo: "2 · Revise a prévia",
    texto: "Veja linhas lidas, duplicadas, inválidas e o impacto estimado antes de confirmar.",
  },
  {
    icone: BarChart3,
    titulo: "3 · Acompanhe",
    texto: "Tudo categorizado e no dashboard, com regras suas para o próximo import.",
  },
] as const;

function Index() {
  const [logado, setLogado] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLogado(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sessao) =>
      setLogado(Boolean(sessao)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <main className="bg-background">
      {/* HERO sobre o shader */}
      <section className="relative isolate overflow-hidden">
        <SilkBackground />
        <div className="absolute right-6 top-6 z-10">
          <ThemeToggle className="border border-shader-hairline bg-shader-glass text-on-shader backdrop-blur hover:bg-shader-glass" />
        </div>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-14 px-6 pb-24 pt-28 sm:pt-32">
          <div className="max-w-3xl stage">
            <span className="inline-flex items-center gap-2 rounded-full border border-shader-hairline bg-shader-glass px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-on-shader-dim backdrop-blur">
              Extrato → categorias → dashboard
            </span>
            <h1 className="mt-6 text-[2.6rem] font-bold leading-[1.05] tracking-tight text-on-shader sm:text-6xl">
              Seu extrato bancário vira
              <br className="hidden sm:block" /> um raio-x dos seus gastos.
            </h1>
            <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-on-shader-dim sm:text-lg">
              O Hash Financeiro lê o arquivo que o seu banco exporta, mostra uma prévia honesta do
              que vai entrar, categoriza cada lançamento automaticamente e devolve um painel claro
              do mês. Sem planilha, sem digitação, sem surpresa no fim do mês.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="shadow-lg">
                <Link to={logado ? "/dashboard" : "/auth"}>
                  {logado ? "Ir para o dashboard" : "Começar de graça"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {!logado && (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-shader-hairline bg-shader-glass text-on-shader backdrop-blur hover:bg-shader-glass hover:text-on-shader"
                >
                  <Link to="/auth">Já tenho conta</Link>
                </Button>
              )}
            </div>

            <dl className="mt-14 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
              {[
                ["CSV · PDF", "formatos aceitos"],
                ["0", "duplicatas gravadas"],
                ["1 clique", "para apagar tudo"],
                ["100%", "isolado por usuário"],
              ].map(([valor, rotulo]) => (
                <div key={rotulo}>
                  <dt className="num text-xl font-semibold text-on-shader">{valor}</dt>
                  <dd className="mt-1 text-[11px] uppercase tracking-[0.12em] text-on-shader-dim">
                    {rotulo}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
      </section>

      {/* VANTAGENS */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="eyebrow">Por que usar</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Feito para o extrato bagunçado do mundo real
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-faint">
            Cada detalhe existe porque exportar extrato dá errado de um jeito diferente em cada
            banco — e porque dado financeiro é dado sensível.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vantagens.map((v, i) => (
            <article
              key={v.titulo}
              className="panel hairline-top stage p-5 transition-colors hover:border-signal/40"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-signal/10 text-signal">
                <v.icone className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-foreground">{v.titulo}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">{v.texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="border-y border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="eyebrow">Como funciona</p>
          <h2 className="mt-2 max-w-xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Três passos entre o arquivo e a resposta
          </h2>

          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {passos.map((p) => (
              <li key={p.titulo} className="rounded-lg border border-hairline p-5">
                <p.icone className="h-5 w-5 text-signal" aria-hidden />
                <h3 className="mt-4 font-display text-[15px] font-semibold text-foreground">
                  {p.titulo}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* SEGURANÇA */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="panel hairline-top grid gap-8 p-8 md:grid-cols-[1.1fr_1fr] md:p-10">
          <div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-mint/10 text-mint">
              <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Segurança e LGPD não são página de marketing aqui
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-faint">
              Todo o desenho do sistema parte do princípio de que extrato bancário é dado sensível:
              acesso restrito no banco, nada de dado financeiro em log e o direito ao esquecimento
              implementado de verdade.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/privacidade">Ver garantias de privacidade</Link>
            </Button>
          </div>
          <ul className="grid content-start gap-3 text-[13px] leading-relaxed text-ink-dim">
            {[
              "Isolamento por usuário aplicado no próprio banco de dados.",
              "Arquivo do extrato processado em memória, nunca armazenado.",
              "Nenhum valor, descrição ou identificador financeiro em log.",
              "Deduplicação por hash: reimportar não corrompe o histórico.",
              "Exclusão definitiva da conta e de todos os dados a qualquer momento.",
            ].map((item) => (
              <li key={item} className="flex gap-3 rounded-md border border-hairline p-3">
                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden border-t border-hairline">
        <SilkBackground />
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-on-shader sm:text-4xl">
            Descubra para onde foi o seu dinheiro este mês
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-on-shader-dim">
            Crie a conta, importe um extrato e veja o painel pronto em menos de um minuto.
          </p>
          <Button asChild size="lg" className="mt-8 shadow-lg">
            <Link to={logado ? "/dashboard" : "/auth"}>
              {logado ? "Abrir dashboard" : "Criar conta grátis"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-[12px] text-ink-faint">
        Hash Financeiro — projeto de portfólio com foco em processamento de dados, domínio fintech e
        segurança de dados sensíveis.
      </footer>
    </main>
  );
}
