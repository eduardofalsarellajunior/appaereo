-- Radar de Voos — schema inicial (especificação técnica, seção 5)

-- Intenções de viagem (as 3-4 rotas que você cadastra)
create table intencoes_viagem (
  id uuid primary key default gen_random_uuid(),
  nome text not null, -- ex: 'BR -> Japão (férias)'
  origens text[] not null, -- ex: ['GRU','GIG','VCP']
  destinos text[] not null, -- ex: ['NRT','HND','KIX']
  data_inicio date,
  data_fim date,
  flexibilidade_dias int default 0,
  max_escalas int default 2,
  cabine text default 'economy',
  ativa boolean default true,
  created_at timestamptz default now()
);

-- Rotas candidatas geradas pelo motor de grafo (topologia, não preço)
create table rotas_candidatas (
  id uuid primary key default gen_random_uuid(),
  intencao_id uuid references intencoes_viagem(id) on delete cascade,
  trechos jsonb not null, -- [{origem, destino, cia_sugerida}]
  hubs_intermediarios text[],
  num_escalas int,
  mct_respeitado boolean default true,
  ativa boolean default true,
  created_at timestamptz default now()
);

-- Histórico de preço em dinheiro
create table price_history (
  id uuid primary key default gen_random_uuid(),
  rota_candidata_id uuid references rotas_candidatas(id) on delete cascade,
  data_consulta date not null,
  preco numeric not null,
  moeda text default 'BRL',
  cia_aerea text,
  fonte text default 'duffel',
  raw_response jsonb,
  created_at timestamptz default now()
);

-- Histórico de disponibilidade em milhas
create table mileage_history (
  id uuid primary key default gen_random_uuid(),
  rota_candidata_id uuid references rotas_candidatas(id) on delete cascade,
  data_consulta date not null,
  programa text not null, -- ex: 'smiles', 'latampass', 'tudoazul'
  milhas_necessarias int,
  taxas_embarque numeric,
  assentos_disponiveis int,
  fonte text default 'seats_aero',
  created_at timestamptz default now()
);

-- Tabela de conversão de milhas (curada manualmente por você)
create table mileage_conversion (
  programa text primary key,
  valor_por_1000_milhas_brl numeric not null,
  atualizado_em timestamptz default now()
);

-- Alertas disparados
create table alertas_disparados (
  id uuid primary key default gen_random_uuid(),
  rota_candidata_id uuid references rotas_candidatas(id) on delete cascade,
  tipo text, -- 'queda_preco' | 'tarifa_erro' | 'milhas_vantajosas'
  motivo text,
  valor_referencia numeric,
  valor_baseline numeric,
  enviado_email boolean default false,
  created_at timestamptz default now()
);
