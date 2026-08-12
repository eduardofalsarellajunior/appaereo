// Fase 1 — busca a tarifa em dinheiro de UMA rota candidata fixa via Duffel.
//
// Esta função é um caso particular do futuro Motor 2 (monitoramento diário, Fase 3-4):
// aqui ela roda sob demanda para 1 rota fixa; o Motor 2 vai iterar isso para todas as
// `rotas_candidatas` ativas via cron. A lógica de chamada ao Duffel é a mesma.
//
// Deploy: supabase functions deploy buscar-tarifa-fase1
// Secrets necessários (supabase secrets set ...):
//   DUFFEL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const DUFFEL_API_KEY = Deno.env.get('DUFFEL_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Rota candidata fixa da Fase 1 (ver supabase/sql/002_seed_fase1.sql).
// TODO(Fase 2): substituir por leitura de `rotas_candidatas` (todas as ativas), não fixo.
const ROTA_FIXA = {
  origem: 'GRU',
  destino: 'NRT',
  cabine: 'economy',
  data_partida: '2026-10-15', // dentro da janela de 60-90 dias pedida para o teste
}

async function buscarOfertaDuffel() {
  const resp = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DUFFEL_API_KEY}`,
      'Content-Type': 'application/json',
      'Duffel-Version': 'v2',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      data: {
        slices: [
          {
            origin: ROTA_FIXA.origem,
            destination: ROTA_FIXA.destino,
            departure_date: ROTA_FIXA.data_partida,
          },
        ],
        passengers: [{ type: 'adult' }],
        cabin_class: ROTA_FIXA.cabine,
      },
    }),
  })

  if (!resp.ok) {
    const erro = await resp.text()
    throw new Error(`Duffel respondeu ${resp.status}: ${erro}`)
  }

  const json = await resp.json()
  const offers = json.data?.offers ?? []
  if (offers.length === 0) {
    return null
  }

  // Menor tarifa entre as ofertas retornadas.
  const maisBarata = offers.reduce((menor, oferta) =>
    Number(oferta.total_amount) < Number(menor.total_amount) ? oferta : menor
  )

  return {
    preco: Number(maisBarata.total_amount),
    moeda: maisBarata.total_currency,
    cia_aerea: maisBarata.owner?.name ?? null,
    raw: json,
  }
}

Deno.serve(async () => {
  if (!DUFFEL_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ erro: 'Faltam secrets: DUFFEL_API_KEY, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500 }
    )
  }

  try {
    const resultado = await buscarOfertaDuffel()
    if (!resultado) {
      return new Response(JSON.stringify({ ok: true, mensagem: 'Nenhuma oferta encontrada' }), { status: 200 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fase 1 tem apenas 1 rota candidata fixa (ver supabase/sql/002_seed_fase1.sql).
    // TODO(Fase 2): quando houver várias, resolver a rota certa por id explícito.
    const { data: rota } = await supabase.from('rotas_candidatas').select('id').limit(1).single()

    const { error } = await supabase.from('price_history').insert({
      rota_candidata_id: rota?.id ?? null,
      data_consulta: new Date().toISOString().slice(0, 10),
      preco: resultado.preco,
      moeda: resultado.moeda,
      cia_aerea: resultado.cia_aerea,
      fonte: 'duffel',
      raw_response: resultado.raw,
    })

    if (error) throw error

    return new Response(
      JSON.stringify({ ok: true, preco: resultado.preco, moeda: resultado.moeda, cia_aerea: resultado.cia_aerea }),
      { status: 200 }
    )
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : JSON.stringify(err)
    return new Response(JSON.stringify({ erro: mensagem }), { status: 500 })
  }
})
