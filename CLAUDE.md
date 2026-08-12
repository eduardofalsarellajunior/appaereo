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

## Estado atual (Fases 1 e 2 concluídas; Fase 3 parcial)

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
- Motor 2 (`supabase/functions/motor2-monitoramento-diario/index.ts`) **deployado e
  testado**: percorre todas as `rotas_candidatas` com `ativa = true` (hoje só a rota
  fixa GRU→NRT), precifica no Duffel somando cada trecho (interlining virtual =
  passagens separadas por trecho) e grava em `price_history`; busca milhas no
  Seats.aero só se `SEATS_AERO_API_KEY` existir (ainda não existe — pula essa parte
  sem falhar o dinheiro). Sem `data_inicio`/`data_fim` na intenção, cai para a mesma
  janela de teste das Fases 1/3. O cálculo de "melhor opção do dia" (dinheiro vs.
  milhas convertidas via `mileage_conversion`) não é persistido — fica para o
  dashboard/Motor 3 calcular em tempo de leitura, já que o schema não tem coluna
  para isso. **Ainda não está agendado como cron** — roda sob demanda; ativar o
  agendamento automático diário (pg_cron) é uma decisão pendente do usuário, por
  gerar custo/chamadas de API recorrentes sem supervisão.
- Integração Seats.aero (`supabase/functions/buscar-milhas-fase3/index.ts`) —
  código implementado (contrato da API confirmado na documentação oficial:
  `GET https://seats.aero/partnerapi/search`, header `Partner-Authorization`), mas
  **não deployado nem testado** — falta o usuário criar a conta/chave (pode exigir
  plano pago, diferente do Duffel). Essa API não retorna taxas de embarque, só
  custo em milhas e assentos por cabine; `taxas_embarque` fica `null` em
  `mileage_history` por limitação da fonte, não do código.
- `mileage_conversion` populada (`supabase/sql/004_seed_mileage_conversion.sql`) com
  valores de referência de mercado (Smiles/LATAM Pass R$30, TudoAzul R$25, Livelo
  R$22, Esfera R$20 por 1.000 milhas) — placeholder até o usuário ajustar para sua
  percepção pessoal, como pede a especificação (seção 9). Livelo/Esfera são
  programas de pontos "de banco" (moeda de transferência), não aparecem em buscas
  do Seats.aero diretamente — só entram na conta quando o usuário transfere pontos
  para um programa de milhagem aérea.
- Stub com `TODO` para o motor restante (`supabase/functions/motor3-*/index.ts`),
  sem implementação: Motor 3 — detecção de distorção de preço + disparo de
  e-mail. Fase 4.
- Dashboard completo (Fase 5) ainda não existe; há só `src/pages/TesteFase1.jsx`, uma
  tela mínima para disparar a busca e ver o histórico de preço da rota fixa. Testada
  em navegador real (Chrome, localhost) pelo usuário — funciona ponta a ponta:
  botão dispara a Edge Function, que consulta o Duffel e grava em `price_history`,
  e a lista de histórico é lida de volta via `.from('price_history').select()`.

### Pendências conhecidas

- Chave de produção do Duffel (a de teste usada aqui só retorna dados fictícios).
- Chave de API do Seats.aero (conta/plano ainda não criados pelo usuário).
- Variáveis de ambiente na Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) —
  passo manual do usuário, sem token da Vercel disponível neste ambiente.
- Decisão do usuário sobre agendar o Motor 2 como cron diário de verdade (pg_cron) —
  hoje ele só roda sob demanda.

## Roadmap

| Fase | Entrega | Status |
|---|---|---|
| 1 | Schema Supabase + integração Duffel (cash apenas) para 1 rota de teste fixa | Concluída (com chave de teste) |
| 2 | Motor de geração de rotas candidatas (grafo + MCT) | Concluída |
| 3 | Integração Seats.aero + tabela de conversão de milhas | Parcial (mileage_conversion e Motor 2 prontos; falta chave do Seats.aero) |
| 4 | Motor de detecção de distorção + envio de e-mail | Não iniciado |
| 5 | Painel completo (dashboard) | Não iniciado |
