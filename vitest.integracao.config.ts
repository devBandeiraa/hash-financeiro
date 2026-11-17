// Testes de integração contra o Supabase local. Fica fora do `npm test`, que
// continua rápido e sem infraestrutura: o padrão `*.integracao.ts` não casa
// com o include padrão do Vitest (`*.test.ts`).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integracao/**/*.integracao.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
