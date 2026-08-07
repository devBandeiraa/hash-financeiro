import { Sparkles } from "lucide-react";

import type { CategoriaOrigem } from "@/lib/types/dominio";

/**
 * Marca visual da procedência de uma categoria. Só aparece quando NÃO é o
 * motor determinístico: `sistema` é o caso normal e não merece ruído na tela.
 */
export function BadgeOrigem({ origem }: { origem: CategoriaOrigem }) {
  if (origem === "sistema") return null;

  if (origem === "ia") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md bg-signal/10 px-1.5 py-0.5 text-[10px] font-semibold text-signal"
        title="Categoria sugerida por IA e confirmada por você"
      >
        <Sparkles className="size-2.5" aria-hidden />
        IA
      </span>
    );
  }

  return (
    <span
      className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-ink-dim"
      title="Categoria definida manualmente por você"
    >
      manual
    </span>
  );
}
