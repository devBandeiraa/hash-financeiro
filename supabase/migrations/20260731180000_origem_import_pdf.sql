-- Substitui OFX por PDF no enum origem_import.
--
-- Postgres nao permite remover valor de enum: o tipo e recriado e a coluna
-- migrada. Lancamentos legados marcados como 'OFX' passam a 'CSV' — ambos
-- vieram de importacao de arquivo, e 'OFX' deixa de existir.

ALTER TYPE public.origem_import RENAME TO origem_import_legado;

CREATE TYPE public.origem_import AS ENUM ('CSV', 'PDF', 'MANUAL');

ALTER TABLE public.transacoes
  ALTER COLUMN origem DROP DEFAULT;

ALTER TABLE public.transacoes
  ALTER COLUMN origem TYPE public.origem_import
  USING (
    CASE origem::text
      WHEN 'OFX' THEN 'CSV'
      ELSE origem::text
    END
  )::public.origem_import;

ALTER TABLE public.transacoes
  ALTER COLUMN origem SET DEFAULT 'CSV';

DROP TYPE public.origem_import_legado;
