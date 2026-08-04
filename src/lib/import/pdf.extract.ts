/**
 * Extração do texto de um PDF, no navegador.
 *
 * Roda no cliente de propósito: o PDF nunca sai da máquina do usuário — só o
 * texto reconhecido é enviado ao servidor, igual ao CSV. Mantém a promessa de
 * privacidade da tela de importação.
 *
 * O pdfjs (~750 kB) é carregado sob demanda, no primeiro PDF escolhido: fora
 * do bundle de SSR e fora do carregamento inicial da página.
 *
 * O pdfjs devolve fragmentos soltos com coordenadas; aqui eles são reagrupados
 * em linhas pela coordenada Y para que `parsePdfTexto` veja algo parecido com
 * as linhas do extrato original.
 */

/** Fragmentos até 2pt de diferença no Y são considerados a mesma linha. */
const TOLERANCIA_Y = 2;

export async function extrairTextoPdf(arquivo: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await arquivo.arrayBuffer();
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const doc = await tarefa.promise;

  const paginas: string[] = [];

  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const pagina = await doc.getPage(n);
      const conteudo = await pagina.getTextContent();

      const linhas: { y: number; fragmentos: { x: number; texto: string }[] }[] = [];

      for (const item of conteudo.items) {
        if (!("str" in item) || !item.str) continue;
        const x = item.transform[4] as number;
        const y = item.transform[5] as number;

        const existente = linhas.find((l) => Math.abs(l.y - y) <= TOLERANCIA_Y);
        if (existente) existente.fragmentos.push({ x, texto: item.str });
        else linhas.push({ y, fragmentos: [{ x, texto: item.str }] });
      }

      const texto = linhas
        .sort((a, b) => b.y - a.y) // topo -> base
        .map((l) =>
          l.fragmentos
            .sort((a, b) => a.x - b.x) // esquerda -> direita
            .map((f) => f.texto)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean)
        .join("\n");

      paginas.push(texto);
      pagina.cleanup();
    }
  } finally {
    await tarefa.destroy();
  }

  const completo = paginas.join("\n");

  if (!completo.trim()) {
    throw new Error(
      "Não foi possível ler texto deste PDF. Se ele for digitalizado (imagem), " +
        "exporte o extrato em PDF de texto ou use CSV.",
    );
  }

  return completo;
}
