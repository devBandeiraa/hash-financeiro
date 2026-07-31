# Checklist de segurança / LGPD

Aplicado desde a Fase 1, não no fim do projeto.

| # | Item | Fase |
|---|------|------|
| 1 | Isolamento por usuário no banco (RLS por `usuario_id`), não só no código | 1 |
| 2 | Nenhuma descrição, valor ou nome de arquivo em log — só contadores e IDs | 3 |
| 3 | Senha com hash forte; token JWT com expiração | 2 |
| 4 | Todo endpoint de dado financeiro autenticado; nada sensível em rota pública | 2 |
| 5 | Resposta ao front devolve só o necessário (sem raw do arquivo importado) | 3 |
| 6 | Arquivo de extrato processado em memória e descartado — nunca persistido | 3 |
| 7 | Validação de tamanho e tipo (MIME/extensão) do upload | 3 |
| 8 | Segredos só em variáveis de ambiente do servidor | 0 |
| 9 | Direito ao esquecimento: exclusão em cascata de todos os dados do usuário | 6 |
| 10 | Seção de segurança no README explicando cada decisão | 6 |

## Regra de log

Permitido: `import concluído: 42 importadas, 3 duplicadas, 1 inválida (usuario=<id>)`.

Proibido: qualquer log contendo `descricao`, `valor`, nome do arquivo enviado
ou conteúdo de linha do extrato.
