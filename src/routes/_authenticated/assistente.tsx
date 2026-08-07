import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ChatAgente } from "@/components/ia/chat-agente";

export const Route = createFileRoute("/_authenticated/assistente")({
  component: Assistente,
});

function Assistente() {
  return (
    <AppShell>
      <div className="mb-6">
        <p className="eyebrow">Conversa</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Assistente</h1>
        <p className="mt-1 text-[13px] text-ink-faint">
          Usa as mesmas ferramentas do servidor MCP, sob o seu login. Consulta de verdade; escrita
          só com a sua confirmação.
        </p>
      </div>
      <ChatAgente />
    </AppShell>
  );
}
