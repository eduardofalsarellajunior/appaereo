# Radar de Voos

Projeto pessoal (não comercial) de monitoramento inteligente de rotas aéreas: gera
combinações de trechos plausíveis entre companhias diferentes (interlining virtual
próprio, sem depender de acordo comercial entre elas) e acompanha diariamente o preço
em dinheiro e em milhas de cada rota candidata, com painel visual e alerta por e-mail.

Especificação técnica completa: histórico do chat que originou este projeto (schema,
motores, roadmap). Resumo abaixo; ao editar o schema ou os motores, mantenha este
arquivo alinhado com o código real, não com a especificação original se ela mudar.

## Stack

- Frontend: React 18 + Vite 5, sem TypeScript no frontend.
- Backend/dados: Supabase (Postgres + Edge Functions em Deno/TypeScript).
- Deploy: Vercel (frontend) + Supabase (Edge Functions e cron).
- Gráficos: Recharts.
- E-mail: Resend (ainda não integrado — Fase 4).
- Fontes de dados externas: Duffel (tarifas em dinheiro), Seats.aero (disponibilidade
  em milhas — ainda não integrado, Fase 3).

## Convenções deste repositório

- **Nomes em português** para entidades de domínio (tabelas, campos, variáveis de
  negócio) — segue a especificação original. Nomes técnicos genéricos (funções de
  infra, tipos) podem ficar em inglês.
- **Lógica de servidor sempre em `supabase/functions/`**, nunca em `src/`. Os "motores"
  (geração de rotas, monitoramento diário, detecção de distorção) são cron/Edge
  Functions — nunca rodam no browser. `src/` é só a camada de apresentação (React) que
  lê do Supabase e, no máximo, invoca uma Edge Function sob demanda.
- **Segredos nunca em `VITE_*`**: variáveis prefixadas com `VITE_` são embutidas no
  bundle do browser. `DUFFEL_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e a connection
  string direta do Postgres (`SUPABASE_DB_URL`, usada só por scripts locais/psql,
  nunca pelo frontend) não devem ter esse prefixo e não devem ser commitados — veja
  `.env.example` para o que cada variável faz e onde configurar cada uma.
- Sem abstrações prematuras: é um projeto pessoal de baixo volume (3-4 intenções de
  viagem, monitoramento 1x/dia). Prefira código direto e simples a frameworks/camadas
  extras.

## Estado atual (Fases 1 e 2 concluídas e validadas)

Roadmap completo nas seções abaixo. Neste momento:

- Projeto Supabase ativo: ref `gkabxcoioujnjmbrmfth` (região `sa-east-1`). A conexão
  direta (`db.<ref>.supabase.co:5432`) só resolve em IPv6; use o connection pooler
  (`aws-0-sa-east-1.pooler.supabase.com:6543`) para acesso via `psql`/`SUPABASE_DB_URL`.
- Schema SQL em `supabase/sql/001_schema.sql` (6 tabelas: `intencoes_viagem`,
  `rotas_candidatas`, `price_history`, `mileage_history`, `mileage_conversion`,
  `alertas_disparados`) — **já executado** nesse projeto.
- Seed de teste em `supabase/sql/002_seed_fase1.sql`: 1 intenção de teste
  ("BR -> Japão (teste)") + 1 rota candidata **fixa e manual** (GRU → NRT) — **já
  inserido**.
- Grants padrão (`anon`/`authenticated`/`service_role`) em `supabase/sql/003_grants.sql`
  — necessários porque tabelas criadas via Management API (fora do fluxo normal de
  migration) não recebem os grants automáticos do Supabase. Sem isso, Edge Functions
  falham com "permission denied for table" mesmo usando a service_role key.
- Integração Duffel implementada e **testada de ponta a ponta com dados reais** (chave
  de teste `duffel_test_...`, portanto tarifas retornadas são fictícias/sandbox — a
  chamada e o parsing estão corretos, só falta a chave de produção):
  - `supabase/functions/buscar-tarifa-fase1/index.ts` — Edge Function **deployada e
    ativa** no projeto acima. Busca a tarifa da rota fixa e grava em `price_history`.
    Import do supabase-js usa o especificador `npm:@supabase/supabase-js@2` — o
    especificador `jsr:` causou `BOOT_ERROR` ao deployar via Management API, e
    `https://esm.sh/...` também falhou no boot; `npm:` foi o único que funcionou
    nesse caminho de deploy. Inclui headers de CORS (`Access-Control-Allow-*` e
    tratamento de `OPTIONS`) — sem isso, `supabase.functions.invoke()` funciona
    via curl/Node mas é bloqueado pelo preflight do navegador.
  - `scripts/testar-duffel-fase1.mjs` — script Node para validar a chamada à API do
    Duffel localmente, sem depender de deploy da Edge Function.
- Motor 1 (`supabase/functions/motor1-gerar-rotas-candidatas/index.ts`) **deployado e
  testado**: recebe `{ intencao_id }`, gera todas as combinações origem→hub1→hub2→destino
  permitidas por `max_escalas`, cruzando hubs de regiões diferentes nas rotas de 2 escalas
  (evita absurdos tipo DXB→DOH→DXB). Roda sob demanda (chamado manualmente por enquanto —
  a Fase 5 vai chamá-lo automaticamente ao salvar uma intenção). Insere tudo com
  `ativa = false`; ativar candidatos específicos é curadoria manual (ver comentário no
  topo do arquivo e especificação técnica, seção 6). Testado na intenção de teste:
  1712 combinações geradas (16 diretas, 192 de 1 escala, 1504 de 2 escalas), 1711
  inseridas, 1 já existente (a rota fixa do seed) deduplicada por comparação de
  `trechos`. `mct_respeitado` nasce sempre `true` — o motor só gera topologia (pares de
  aeroportos), sem horários reais de voo para validar MCT de verdade; isso fica para o
  Motor 2/3, quando houver horários de trecho via Duffel. Hubs curados hoje só cobrem
  o exemplo BR↔Ásia da especificação (Oriente Médio, EUA, Ásia); adicionar outras
  regiões (ex. Europa) exige editar `HUBS_POR_REGIAO` no arquivo.
- Stubs com `TODO` para os motores restantes, já no lugar certo
  (`supabase/functions/motor{2,3}-*/index.ts`), mas sem implementação:
  - Motor 2 — monitoramento diário (cron, todas as rotas ativas, Duffel + Seats.aero).
    Fase 3-4.
  - Motor 3 — detecção de distorção de preço + disparo de e-mail. Fase 4.
- Dashboard completo (Fase 5) ainda não existe; há só `src/pages/TesteFase1.jsx`, uma
  tela mínima para disparar a busca e ver o histórico de preço da rota fixa. Testada
  em navegador real (Chrome, localhost) pelo usuário — funciona ponta a ponta:
  botão dispara a Edge Function, que consulta o Duffel e grava em `price_history`,
  e a lista de histórico é lida de volta via `.from('price_history').select()`.

### Pendências conhecidas

- Chave de produção do Duffel (a de teste usada aqui só retorna dados fictícios).
- Variáveis de ambiente na Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) —
  passo manual do usuário, sem token da Vercel disponível neste ambiente.

## Roadmap

| Fase | Entrega | Status |
|---|---|---|
| 1 | Schema Supabase + integração Duffel (cash apenas) para 1 rota de teste fixa | Concluída (com chave de teste) |
| 2 | Motor de geração de rotas candidatas (grafo + MCT) | Concluída |
| 3 | Integração Seats.aero + tabela de conversão de milhas | Não iniciado |
| 4 | Motor de detecção de distorção + envio de e-mail | Não iniciado |
| 5 | Painel completo (dashboard) | Não iniciado |
