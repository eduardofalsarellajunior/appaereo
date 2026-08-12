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

## Estado atual (Fase 1 concluída e validada)

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
    nesse caminho de deploy.
  - `scripts/testar-duffel-fase1.mjs` — script Node para validar a chamada à API do
    Duffel localmente, sem depender de deploy da Edge Function.
- Stubs com `TODO` para os motores futuros, já no lugar certo
  (`supabase/functions/motor{1,2,3}-*/index.ts`), mas sem implementação:
  - Motor 1 — geração de rotas candidatas (grafo de hubs + MCT). Fase 2.
  - Motor 2 — monitoramento diário (cron, todas as rotas ativas, Duffel + Seats.aero).
    Fase 3-4.
  - Motor 3 — detecção de distorção de preço + disparo de e-mail. Fase 4.
- Dashboard completo (Fase 5) ainda não existe; há só `src/pages/TesteFase1.jsx`, uma
  tela mínima para disparar a busca e ver o histórico de preço da rota fixa. O build
  (`npm run build`) passa; a chamada real à Edge Function e ao Postgres via REST
  (`supabase.functions.invoke`, `.from('price_history').select()`) **não foi validada
  em navegador** nesta sessão — o ambiente de desenvolvimento (sandbox remoto) tem uma
  política de rede que impede requisições HTTPS do Chromium a domínios externos
  (`*.supabase.co`) mesmo configurando o proxy explicitamente; chamadas equivalentes
  via `curl`/Node funcionam normalmente. Validar no seu navegador local antes de
  confiar cegamente na tela.

### Pendências conhecidas

- Chave de produção do Duffel (a de teste usada aqui só retorna dados fictícios).
- Variáveis de ambiente na Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) —
  passo manual do usuário, sem token da Vercel disponível neste ambiente.
- Testar `src/pages/TesteFase1.jsx` num navegador real (ver nota acima).

## Roadmap

| Fase | Entrega | Status |
|---|---|---|
| 1 | Schema Supabase + integração Duffel (cash apenas) para 1 rota de teste fixa | Concluída (com chave de teste) |
| 2 | Motor de geração de rotas candidatas (grafo + MCT) | Não iniciado |
| 3 | Integração Seats.aero + tabela de conversão de milhas | Não iniciado |
| 4 | Motor de detecção de distorção + envio de e-mail | Não iniciado |
| 5 | Painel completo (dashboard) | Não iniciado |
