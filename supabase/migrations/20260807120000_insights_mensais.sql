-- ============================================================
-- Fase A4 (IA): cache dos insights mensais
-- ============================================================
--
-- Guarda o texto gerado por mes para nao chamar o modelo a cada load da tela.
--
-- `impressao` e o SHA-256 dos agregados que produziram o texto. E o que
-- invalida o cache: se o usuario importar um extrato novo, os numeros mudam,
-- a impressao muda e o texto e regerado sozinho. Sem TTL arbitrario e sem
-- risco de mostrar analise que nao corresponde mais aos dados.
--
-- Nao guardamos os agregados em si -- so o hash. O texto ja contem os numeros
-- que importam, e armazenar menos e a escolha certa num app financeiro.

CREATE TABLE public.insights_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes TEXT NOT NULL CHECK (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  texto TEXT NOT NULL,
  impressao TEXT NOT NULL,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT insights_mes_unico UNIQUE (usuario_id, mes)
);

CREATE INDEX insights_usuario_idx ON public.insights_mensais (usuario_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights_mensais TO authenticated;
GRANT ALL ON public.insights_mensais TO service_role;

ALTER TABLE public.insights_mensais ENABLE ROW LEVEL SECURITY;

-- Mesmo padrao das demais tabelas de dado financeiro: isolamento por linha.
CREATE POLICY "insights_proprios" ON public.insights_mensais FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

COMMENT ON COLUMN public.insights_mensais.impressao IS
  'SHA-256 dos agregados que geraram o texto. Divergiu = cache velho, regenera.';
