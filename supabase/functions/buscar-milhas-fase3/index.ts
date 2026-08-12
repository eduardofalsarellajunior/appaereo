// Fase 3 — busca disponibilidade em milhas de UMA rota candidata fixa via Seats.aero.
//
// Mesmo papel que buscar-tarifa-fase1 teve para o Duffel na Fase 1: valida a
// integração numa rota fixa antes de generalizar para o Motor 2 (todas as rotas
// ativas, Fase 3-4). Usa a mesma rota fixa GRU -> NRT.
//
// API: GET https://seats.aero/partnerapi/search (Partner API, documentação oficial
// em developers.seats.aero/reference/cached-search). Não retorna taxas de embarque
// — só custo em milhas e assentos por cabine — por isso `taxas_embarque` fica nulo
// aqui; a especificação (seção 7) prevê esse campo mas a fonte de dados não cobre.
//
// Deploy: supabase functions deploy buscar-milhas-fase3
// Secrets necessários (supabase secrets set ...):
//   SEATS_AERO_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const SEATS_AERO_API_KEY = Deno.env.get('SEATS_AERO_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Mesma rota fixa da Fase 1 (ver supabase/sql/002_seed_fase1.sql).
const ROTA_FIXA = {
  origem: 'GRU',
  destino: 'NRT',
}
// Award space é escasso — buscar uma janela de datas em vez de um dia único
// aumenta a chance de achar disponibilidade real para validar a integração.
const JANELA_BUSCA = { start_date: '2026-10-01', end_date: '2026-11-30' }

async function buscarDisponibilidadeSeatsAero() {
  const params = new URLSearchParams({
    origin_airport: ROTA_FIXA.origem,
    destination_airport: ROTA_FIXA.destino,
    start_date: JANELA_BUSCA.start_date,
    end_date: JANELA_BUSCA.end_date,
    cabins: 'economy',
    order_by: 'lowest_mileage',
    take: '50',
  })

  const resp = await fetch(`https://seats.aero/partnerapi/search?${params}`, {
    headers: {
      'Partner-Authorization': SEATS_AERO_API_KEY,
      Accept: 'application/json',
    },
  })

  if (!resp.ok) {
    const erro = await resp.text()
    throw new Error(`Seats.aero respondeu ${resp.status}: ${erro}`)
  }

  const json = await resp.json()
  return json.data ?? []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (!SEATS_AERO_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { erro: 'Faltam secrets: SEATS_AERO_API_KEY, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' },
      500
    )
  }

  try {
    const linhas = await buscarDisponibilidadeSeatsAero()
    const comAssentoEconomica = linhas.filter((l) => l.YAvailable && Number(l.YMileageCost) > 0)

    if (comAssentoEconomica.length === 0) {
      return jsonResponse({ ok: true, mensagem: 'Nenhuma disponibilidade em milhas encontrada na janela buscada' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fase 3 tem apenas 1 rota candidata fixa em teste (mesma da Fase 1).
    // TODO(Fase 3-4): quando o Motor 2 rodar para todas as rotas ativas, resolver
    // a rota certa por id explícito em vez de pegar a primeira.
    const { data: rota } = await supabase.from('rotas_candidatas').select('id').limit(1).single()

    const registros = comAssentoEconomica.map((l) => ({
      rota_candidata_id: rota?.id ?? null,
      data_consulta: new Date().toISOString().slice(0, 10),
      programa: l.Source,
      milhas_necessarias: Number(l.YMileageCost),
      taxas_embarque: null, // Seats.aero não retorna taxas nesta API
      assentos_disponiveis: l.YRemainingSeats ?? null,
      fonte: 'seats_aero',
    }))

    const { error } = await supabase.from('mileage_history').insert(registros)
    if (error) throw error

    return jsonResponse({ ok: true, registros_gravados: registros.length, amostra: registros.slice(0, 5) })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : JSON.stringify(err)
    return jsonResponse({ erro: mensagem }, 500)
  }
})
