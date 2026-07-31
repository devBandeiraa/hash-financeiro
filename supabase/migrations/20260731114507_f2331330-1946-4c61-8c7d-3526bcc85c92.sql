-- ============================================================
-- FinPessoal — Fase 1: schema + seed
-- ============================================================

CREATE TYPE public.tipo_conta AS ENUM ('CORRENTE', 'POUPANCA', 'CARTAO');
CREATE TYPE public.tipo_transacao AS ENUM ('DEBITO', 'CREDITO');
CREATE TYPE public.origem_import AS ENUM ('CSV', 'OFX', 'MANUAL');

-- ---------- perfis ----------
CREATE TABLE public.perfis (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_exibicao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perfis TO authenticated;
GRANT ALL ON public.perfis TO service_role;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perfis_proprio" ON public.perfis FOR ALL TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.perfis (id, nome_exibicao)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'nome_exibicao');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- categorias ----------
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '#94a3b8',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categorias_usuario_nome_idx ON public.categorias (usuario_id, nome);
CREATE UNIQUE INDEX categorias_sistema_nome_idx ON public.categorias (nome) WHERE usuario_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias TO authenticated;
GRANT ALL ON public.categorias TO service_role;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias_leitura" ON public.categorias FOR SELECT TO authenticated
  USING (usuario_id IS NULL OR usuario_id = auth.uid());
CREATE POLICY "categorias_insert" ON public.categorias FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "categorias_update" ON public.categorias FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "categorias_delete" ON public.categorias FOR DELETE TO authenticated
  USING (usuario_id = auth.uid());

-- ---------- contas ----------
CREATE TABLE public.contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo public.tipo_conta NOT NULL DEFAULT 'CORRENTE',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contas_usuario_idx ON public.contas (usuario_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas TO authenticated;
GRANT ALL ON public.contas TO service_role;
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contas_proprias" ON public.contas FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- ---------- regras_categorizacao ----------
CREATE TABLE public.regras_categorizacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  palavra_chave TEXT NOT NULL,
  categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  prioridade INTEGER NOT NULL DEFAULT 100,
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX regras_usuario_ativa_idx ON public.regras_categorizacao (usuario_id, ativa);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.regras_categorizacao TO authenticated;
GRANT ALL ON public.regras_categorizacao TO service_role;
ALTER TABLE public.regras_categorizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regras_leitura" ON public.regras_categorizacao FOR SELECT TO authenticated
  USING (usuario_id IS NULL OR usuario_id = auth.uid());
CREATE POLICY "regras_insert" ON public.regras_categorizacao FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "regras_update" ON public.regras_categorizacao FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "regras_delete" ON public.regras_categorizacao FOR DELETE TO authenticated
  USING (usuario_id = auth.uid());

-- ---------- transacoes ----------
CREATE TABLE public.transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conta_id UUID NOT NULL REFERENCES public.contas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  tipo public.tipo_transacao NOT NULL,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  origem public.origem_import NOT NULL DEFAULT 'CSV',
  hash_dedupe TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transacoes_dedupe_unico UNIQUE (usuario_id, hash_dedupe)
);
CREATE INDEX transacoes_usuario_data_idx ON public.transacoes (usuario_id, data DESC);
CREATE INDEX transacoes_usuario_categoria_idx ON public.transacoes (usuario_id, categoria_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transacoes TO authenticated;
GRANT ALL ON public.transacoes TO service_role;
ALTER TABLE public.transacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transacoes_proprias" ON public.transacoes FOR ALL TO authenticated
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- ============================================================
-- Seed: categorias e regras padrão do sistema (usuario_id NULL)
-- ============================================================

INSERT INTO public.categorias (id, usuario_id, nome, cor) VALUES
  ('11111111-0000-4000-8000-000000000001', NULL, 'Alimentação',      '#f97316'),
  ('11111111-0000-4000-8000-000000000002', NULL, 'Transporte',       '#0ea5e9'),
  ('11111111-0000-4000-8000-000000000003', NULL, 'Moradia',          '#8b5cf6'),
  ('11111111-0000-4000-8000-000000000004', NULL, 'Lazer',            '#ec4899'),
  ('11111111-0000-4000-8000-000000000005', NULL, 'Saúde',            '#10b981'),
  ('11111111-0000-4000-8000-000000000006', NULL, 'Educação',         '#6366f1'),
  ('11111111-0000-4000-8000-000000000007', NULL, 'Compras',          '#f43f5e'),
  ('11111111-0000-4000-8000-000000000008', NULL, 'Serviços',         '#14b8a6'),
  ('11111111-0000-4000-8000-000000000009', NULL, 'Receita',          '#22c55e'),
  ('11111111-0000-4000-8000-00000000000a', NULL, 'Não categorizado', '#94a3b8');

INSERT INTO public.regras_categorizacao (usuario_id, palavra_chave, categoria_id, prioridade) VALUES
  (NULL, 'IFOOD',        '11111111-0000-4000-8000-000000000001', 100),
  (NULL, 'RAPPI',        '11111111-0000-4000-8000-000000000001', 100),
  (NULL, 'MERCADO',      '11111111-0000-4000-8000-000000000001', 110),
  (NULL, 'SUPERMERCADO', '11111111-0000-4000-8000-000000000001', 100),
  (NULL, 'PADARIA',      '11111111-0000-4000-8000-000000000001', 100),
  (NULL, 'RESTAURANTE',  '11111111-0000-4000-8000-000000000001', 100),
  (NULL, 'UBER',         '11111111-0000-4000-8000-000000000002', 100),
  (NULL, '99APP',        '11111111-0000-4000-8000-000000000002', 100),
  (NULL, 'POSTO',        '11111111-0000-4000-8000-000000000002', 100),
  (NULL, 'SHELL',        '11111111-0000-4000-8000-000000000002', 100),
  (NULL, 'ESTACIONAMENTO','11111111-0000-4000-8000-000000000002', 100),
  (NULL, 'ALUGUEL',      '11111111-0000-4000-8000-000000000003', 100),
  (NULL, 'CONDOMINIO',   '11111111-0000-4000-8000-000000000003', 100),
  (NULL, 'ENERGIA',      '11111111-0000-4000-8000-000000000003', 100),
  (NULL, 'SANEAMENTO',   '11111111-0000-4000-8000-000000000003', 100),
  (NULL, 'NETFLIX',      '11111111-0000-4000-8000-000000000004', 100),
  (NULL, 'SPOTIFY',      '11111111-0000-4000-8000-000000000004', 100),
  (NULL, 'CINEMA',       '11111111-0000-4000-8000-000000000004', 100),
  (NULL, 'STEAM',        '11111111-0000-4000-8000-000000000004', 100),
  (NULL, 'FARMACIA',     '11111111-0000-4000-8000-000000000005', 100),
  (NULL, 'DROGARIA',     '11111111-0000-4000-8000-000000000005', 100),
  (NULL, 'HOSPITAL',     '11111111-0000-4000-8000-000000000005', 100),
  (NULL, 'UNIMED',       '11111111-0000-4000-8000-000000000005', 100),
  (NULL, 'UDEMY',        '11111111-0000-4000-8000-000000000006', 100),
  (NULL, 'ALURA',        '11111111-0000-4000-8000-000000000006', 100),
  (NULL, 'FACULDADE',    '11111111-0000-4000-8000-000000000006', 100),
  (NULL, 'AMAZON',       '11111111-0000-4000-8000-000000000007', 100),
  (NULL, 'MERCADOLIVRE', '11111111-0000-4000-8000-000000000007',  90),
  (NULL, 'SHOPEE',       '11111111-0000-4000-8000-000000000007', 100),
  (NULL, 'MAGAZINE',     '11111111-0000-4000-8000-000000000007', 100),
  (NULL, 'VIVO',         '11111111-0000-4000-8000-000000000008', 100),
  (NULL, 'CLARO',        '11111111-0000-4000-8000-000000000008', 100),
  (NULL, 'TIM ',         '11111111-0000-4000-8000-000000000008', 100),
  (NULL, 'INTERNET',     '11111111-0000-4000-8000-000000000008', 100),
  (NULL, 'SALARIO',      '11111111-0000-4000-8000-000000000009',  50),
  (NULL, 'PAGAMENTO SALARIO', '11111111-0000-4000-8000-000000000009', 40),
  (NULL, 'RENDIMENTO',   '11111111-0000-4000-8000-000000000009',  50);