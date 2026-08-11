# Radar de Voos

Monitoramento pessoal de rotas aéreas: preço em dinheiro (Duffel) e em milhas
(Seats.aero, Fase 3), com detecção de distorção de tarifa e alerta por e-mail.

Contexto completo do projeto, convenções e estado atual: ver [`CLAUDE.md`](./CLAUDE.md).

## Setup local

```bash
npm install
cp .env.example .env   # preencha com suas chaves (ver .env.example)
npm run dev
```

## Estrutura

- `src/` — frontend React (Vite).
- `supabase/sql/` — schema e seeds, executados diretamente no Postgres do projeto.
- `supabase/functions/` — Edge Functions: integração Duffel/Seats.aero e os três
  motores (geração de rotas, monitoramento diário, detecção de distorção).
- `scripts/` — scripts Node para validação manual, fora do runtime do app.
