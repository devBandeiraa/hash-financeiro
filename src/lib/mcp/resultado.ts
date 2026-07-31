import type { ToolHandlerResult } from "@lovable.dev/mcp-js";

/** Empacota qualquer payload como conteúdo de texto JSON aceito pelo protocolo MCP. */
export function resultadoJson(payload: unknown): ToolHandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
