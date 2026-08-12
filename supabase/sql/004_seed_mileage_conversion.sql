-- Radar de Voos — valores iniciais de referência para mileage_conversion.
--
-- IMPORTANTE: estes são valores de mercado comumente citados pela comunidade
-- brasileira de milhas (ordem de grandeza, não cotação oficial de nenhum programa).
-- A especificação técnica (seção 9) é explícita: esta tabela deve refletir SUA
-- percepção pessoal de valor por 1.000 milhas, não um preço de mercado — ajuste
-- livremente com `update mileage_conversion set valor_por_1000_milhas_brl = ...`.

insert into mileage_conversion (programa, valor_por_1000_milhas_brl) values
  ('smiles', 30),
  ('latampass', 30),
  ('tudoazul', 25),
  ('livelo', 22),
  ('esfera', 20)
on conflict (programa) do nothing;
