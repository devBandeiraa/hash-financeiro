-- ============================================================
-- RLS: referências só para dados do próprio usuário
-- ============================================================
--
-- As políticas de `transacoes` e `regras_categorizacao` conferiam só
-- `usuario_id`. A chave estrangeira garante que `conta_id` e `categoria_id`
-- existem, mas não de quem são. Assim, um usuário que conhecesse o UUID da
-- conta ou da categoria de outro conseguia gravar uma linha própria
-- apontando para ela -- e, quando o outro apagava a conta, o
-- ON DELETE CASCADE levava a transação junto.
--
-- Agora o WITH CHECK também exige que:
--   - a conta da transação seja do usuário;
--   - a categoria (da transação ou da regra) seja do usuário ou do sistema
--     (usuario_id NULL).
--
-- As subconsultas rodam sob o RLS de `contas` e `categorias`, que não
-- consultam `transacoes` nem `regras_categorizacao`: não há recursão.
-- USING não muda: o que cada usuário lê, altera e apaga continua igual.
--
-- Linhas gravadas antes desta migration não são verificadas por ela. Para
-- conferir se existe alguma referência cruzada antiga (resultado esperado: 0):
--
--   SELECT
--     (SELECT count(*) FROM public.transacoes t JOIN public.contas c ON c.id = t.conta_id
--       WHERE c.usuario_id <> t.usuario_id)
--   + (SELECT count(*) FROM public.transacoes t JOIN public.categorias k ON k.id = t.categoria_id
--       WHERE k.usuario_id IS NOT NULL AND k.usuario_id <> t.usuario_id)
--   + (SELECT count(*) FROM public.regras_categorizacao r JOIN public.categorias k ON k.id = r.categoria_id
--       WHERE k.usuario_id IS NOT NULL AND k.usuario_id IS DISTINCT FROM r.usuario_id)
--   AS referencias_cruzadas;

-- ---------- transacoes ----------
DROP POLICY "transacoes_proprias" ON public.transacoes;

CREATE POLICY "transacoes_proprias" ON public.transacoes FOR ALL TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.contas c
      WHERE c.id = conta_id AND c.usuario_id = auth.uid()
    )
    AND (
      categoria_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.categorias k
        WHERE k.id = categoria_id AND (k.usuario_id IS NULL OR k.usuario_id = auth.uid())
      )
    )
  );

-- ---------- regras_categorizacao ----------
DROP POLICY "regras_insert" ON public.regras_categorizacao;
DROP POLICY "regras_update" ON public.regras_categorizacao;

CREATE POLICY "regras_insert" ON public.regras_categorizacao FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.categorias k
      WHERE k.id = categoria_id AND (k.usuario_id IS NULL OR k.usuario_id = auth.uid())
    )
  );

CREATE POLICY "regras_update" ON public.regras_categorizacao FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (
    usuario_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.categorias k
      WHERE k.id = categoria_id AND (k.usuario_id IS NULL OR k.usuario_id = auth.uid())
    )
  );
