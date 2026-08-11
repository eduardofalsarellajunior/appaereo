// TODO(Fase 4): Motor 3 — detecção de distorção de preço + envio de e-mail.
//
// Duas regras (aplicam-se também ao custo equivalente em milhas):
//   - Queda relativa: alerta se o preço do dia cair mais de X% (ex. 25%) em relação
//     à mediana móvel dos últimos 30-90 dias daquela rota candidata.
//   - Tarifa de erro (heurística): alerta se uma cabine superior custar igual ou
//     menos que uma cabine inferior na mesma busca, ou se o preço ficar abaixo de
//     um piso absoluto definido por rota.
//
// Ao detectar, grava em `alertas_disparados` e dispara e-mail via Resend
// (rota, preço/milhas atual, baseline histórico, % de queda, link para o painel).
//
// Ver especificação técnica, seção 8 e 11.

Deno.serve(async () => {
  return new Response(JSON.stringify({ erro: 'Motor 3 ainda não implementado (Fase 4)' }), { status: 501 })
})
