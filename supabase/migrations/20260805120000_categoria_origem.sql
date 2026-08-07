-- ============================================================
-- Fase A1 (IA): rastreabilidade da categorizacao
-- ============================================================
--
-- Quem definiu a categoria de um lancamento -- e de onde saiu uma regra.
-- Sem isso a auditoria fica ambigua: nao da para separar o que o motor
-- deterministico classificou do que veio de sugestao de IA aceita.
--
--   sistema  motor de regras (seed ou reclassificacao automatica)
--   usuario  correcao manual feita na interface
--   ia       sugestao do modelo de linguagem confirmada pelo usuario
--
-- RLS: as politicas de `transacoes` e `regras_categorizacao` sao por LINHA
-- (`usuario_id = auth.uid()`), nao por coluna. Colunas novas nascem cobertas
-- pelas politicas existentes -- nao ha politica a criar ou ajustar aqui.

CREATE TYPE public.categoria_origem AS ENUM ('sistema', 'usuario', 'ia');

-- ---------- transacoes ----------
-- Default 'sistema': todo lancamento existente foi categorizado pelo motor
-- de regras (ou ficou sem categoria, caso em que a origem e irrelevante).
ALTER TABLE public.transacoes
  ADD COLUMN categoria_origem public.categoria_origem NOT NULL DEFAULT 'sistema';

COMMENT ON COLUMN public.transacoes.categoria_origem IS
  'Quem definiu categoria_id: sistema (motor de regras), usuario (correcao manual) ou ia (sugestao aceita).';

-- ---------- regras_categorizacao ----------
-- Uma regra promovida a partir de sugestao de IA precisa se declarar: ela
-- passa a alimentar o motor deterministico, e a trilha nao pode se perder.
ALTER TABLE public.regras_categorizacao
  ADD COLUMN origem public.categoria_origem NOT NULL DEFAULT 'usuario';

-- As 37 regras do seed tem usuario_id NULL -- sao do sistema, nao do usuario.
UPDATE public.regras_categorizacao SET origem = 'sistema' WHERE usuario_id IS NULL;

COMMENT ON COLUMN public.regras_categorizacao.origem IS
  'Quem criou a regra: sistema (seed), usuario (criada na interface) ou ia (promovida de uma sugestao aceita).';
