// TODO(Fase 2): Motor 1 — geração de rotas candidatas.
//
// Dispara quando uma `intencao_viagem` é criada/editada (não diariamente).
// Recebe origens[], destinos[], max_escalas; usa lista curada de hubs por região
// (ex. BR<->Ásia: DXB, DOH, AUH, LAX, IAH, DFW, ORD, ICN, PVG, HKG, SIN, TPE);
// gera combinações origem -> hub1 -> hub2 -> destino (0-2 escalas) sem restringir
// companhia por trecho; aplica tabela própria de MCT (mais conservadora que o
// MCT oficial de interline); persiste cada combinação viável em `rotas_candidatas`.
//
// Ver especificação técnica, seção 6.

Deno.serve(async () => {
  return new Response(JSON.stringify({ erro: 'Motor 1 ainda não implementado (Fase 2)' }), { status: 501 })
})
