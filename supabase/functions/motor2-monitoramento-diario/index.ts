// TODO(Fase 3-4): Motor 2 — monitoramento diário (Supabase Scheduled Function / cron).
//
// Para cada `rota_candidata` ativa:
//   1. Busca tarifa em dinheiro no Duffel, trecho a trecho, somando o custo total.
//      (a lógica de chamada ao Duffel já existe em ../buscar-tarifa-fase1/index.ts,
//      hoje fixada em 1 rota — aqui vira um loop sobre todas as rotas ativas)
//   2. Busca disponibilidade em milhas no Seats.aero para os programas relevantes (Fase 3).
//   3. Grava em `price_history` e `mileage_history`.
//   4. Calcula o custo equivalente em BRL de cada linha de milhas:
//      milhas_necessarias / 1000 * valor_por_1000_milhas_brl + taxas_embarque
//   5. Determina a "melhor opção do dia" entre dinheiro e milhas convertidas.
//   6. Chama o Motor 3 (detecção de distorção) para cada rota atualizada.
//
// Ver especificação técnica, seção 7.

Deno.serve(async () => {
  return new Response(JSON.stringify({ erro: 'Motor 2 ainda não implementado (Fase 3-4)' }), { status: 501 })
})
