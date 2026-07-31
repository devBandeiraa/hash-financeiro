# Serviços de agregação (Fase 5)

Agregações calculadas no banco (SQL), nunca no front:

- `totalDoMes(mes)` — soma de débitos no período
- `gastosPorCategoria(periodo)` — pizza/barras
- `evolucaoMensal(meses)` — série temporal

Todas escopadas por usuário via RLS. O front recebe só os agregados,
nunca o conjunto bruto de transações para somar no cliente.
