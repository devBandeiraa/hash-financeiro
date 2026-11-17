// Eval da categorização. Usa o Supabase local (`npm run supabase:local`) como
// fonte das regras e categorias do sistema. Fica fora do `npm test`: o padrão
// `*.eval.ts` não casa com o include padrão do Vitest.
import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const raiz = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  test: {
    root: raiz,
    include: ["evals/**/*.eval.ts"],
    // Chaves de IA do `.env`, só para o modo com IA.
    env: loadEnv("", raiz, ""),
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
