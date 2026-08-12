-- Radar de Voos — piso absoluto de preço por rota candidata (Motor 3, seção 8).
--
-- Nullable: sem valor definido, a heurística de "tarifa de erro por piso absoluto"
-- simplesmente não dispara para aquela rota. Curadoria manual, como mileage_conversion.
alter table rotas_candidatas add column if not exists piso_absoluto numeric;
