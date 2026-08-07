-- Adiciona PDF ao enum origem_import (substituindo OFX na pratica).
--
-- Historico: a primeira versao deste arquivo recriava o tipo do zero para
-- remover 'OFX'. Ela nunca chegou a rodar neste banco -- 'PDF' entrou por
-- outro caminho e 'OFX' permaneceu no tipo. Reescrita para ser idempotente e
-- descrever o estado real: roda tanto em banco novo quanto no existente.
--
-- 'OFX' continua existindo no enum. Postgres nao remove valor de enum sem
-- recriar o tipo, e recriar um tipo em uso e DDL destrutivo que nao compensa
-- por um valor orfao. Nenhum caminho de codigo escreve 'OFX': o parser de OFX
-- foi removido e `importarExtrato` so aceita 'CSV' | 'PDF'.

ALTER TYPE public.origem_import ADD VALUE IF NOT EXISTS 'PDF';

-- Lancamentos legados marcados como 'OFX' passam a 'CSV' -- ambos vieram de
-- importacao de arquivo. So usa valores pre-existentes do enum, entao e
-- seguro na mesma transacao do ADD VALUE acima.
UPDATE public.transacoes SET origem = 'CSV' WHERE origem::text = 'OFX';
