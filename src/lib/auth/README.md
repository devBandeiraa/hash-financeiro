# Auth (Fase 2)

- Guardas de sessão e helper `requireAuth` para as server functions.
- Todo dado financeiro é escopado por usuário no banco (RLS por `usuario_id`),
  não só no código da aplicação.
- Senha com hash forte, token com expiração — nada disso é implementado à mão
  no ambiente Lovable Cloud; a camada gerenciada cuida de hash e emissão/rotação
  de JWT.
