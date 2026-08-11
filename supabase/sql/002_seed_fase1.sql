-- Radar de Voos — dados de teste para validar a Fase 1 (integração Duffel)
-- Rota candidata FIXA e manual (o motor de geração de rotas é Fase 2, ainda não existe).

with intencao as (
  insert into intencoes_viagem (nome, origens, destinos, max_escalas, cabine)
  values (
    'BR -> Japão (teste)',
    array['VCP','GRU','CGH','CNF'],
    array['HND','NRT','KIX','NGO'],
    2,
    'economy'
  )
  returning id
)
insert into rotas_candidatas (intencao_id, trechos, hubs_intermediarios, num_escalas, mct_respeitado)
select
  intencao.id,
  '[{"origem": "GRU", "destino": "NRT", "cia_sugerida": null}]'::jsonb,
  array[]::text[],
  0,
  true
from intencao
returning id, intencao_id;
