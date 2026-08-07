/**
 * Extração da palavra-chave que transforma uma sugestão de IA em regra
 * determinística. Função pura — é o ponto onde a IA "alimenta" o motor.
 *
 * O objetivo é achar o estabelecimento dentro do ruído do extrato:
 * "PAG*BarbeariaDoZe" -> "BARBEARIADOZE", "DROGASIL 1234" -> "DROGASIL".
 *
 * Conservador de propósito: na dúvida devolve `null` e a sugestão é aplicada
 * sem virar regra. Regra ruim contamina todo import futuro em silêncio;
 * sugestão sem regra só custa uma chamada de IA a mais na próxima vez.
 */
import { normalizarDescricao } from "@/lib/import/normalize";

/**
 * Termos de operação bancária, não de estabelecimento. Só entram aqui
 * palavras que nunca identificam um comerciante sozinhas — por isso
 * "MERCADO", "POSTO" e afins ficam de fora: são regras legítimas do seed.
 */
const RUIDO = new Set([
  "PAG",
  "PAGTO",
  "PAGAMENTO",
  "COMPRA",
  "COMPRAS",
  "CARTAO",
  "DEBITO",
  "CREDITO",
  "DEB",
  "CRED",
  "PIX",
  "TED",
  "DOC",
  "TRANSFERENCIA",
  "TRANSF",
  "ENVIADO",
  "RECEBIDO",
  "SAQUE",
  "TARIFA",
  "PARCELA",
  "PARC",
  "LTDA",
  "EIRELI",
  "MEI",
  "WWW",
  "COM",
  "ONLINE",
]);

/** Curto demais vira regra que casa com meio extrato. */
const MINIMO = 4;

/**
 * Devolve a palavra-chave da descrição, ou `null` quando não há uma âncora
 * confiável. O resultado já vem normalizado (maiúsculas, sem acento), no
 * mesmo formato que o motor de regras compara.
 */
export function extrairPalavraChave(descricao: string): string | null {
  const tokens = normalizarDescricao(descricao).split(" ").filter(Boolean);

  const uteis = tokens.filter((t) => !/^\d+$/.test(t) && !RUIDO.has(t) && t.length >= 3);
  if (!uteis.length) return null;

  const primeira = uteis[0]!;
  if (primeira.length >= MINIMO) return primeira;

  // Token de 3 letras sozinho é ambíguo: só vale colado no seguinte.
  const segunda = uteis[1];
  return segunda ? `${primeira} ${segunda}` : null;
}
