// Motor 2 — monitoramento diário (Supabase Scheduled Function / cron).
//
// Generaliza buscar-tarifa-fase1 e buscar-milhas-fase3 para TODAS as
// `rotas_candidatas` com `ativa = true` (hoje só a rota fixa GRU->NRT da Fase 1).
// Para cada uma:
//   1. Duffel, trecho a trecho (soma o total da combinação) -> price_history.
//   2. Seats.aero, origem->destino geral da rota -> mileage_history (um registro
//      por programa com disponibilidade). Se SEATS_AERO_API_KEY não estiver
//      configurada, pula a parte de milhas sem falhar o dinheiro.
//   3. mileage_conversion fica para o Motor 3/dashboard calcular a melhor opção
//      do dia (dinheiro vs. milhas) em tempo de leitura — não há coluna no schema
//      para persistir isso, então não é responsabilidade do Motor 2.
//
// Ainda NÃO está agendado como cron — roda sob demanda, mesmo padrão dos testes
// anteriores, até o usuário decidir ativar o agendamento automático (pg_cron).
//
// Deploy: supabase functions deploy motor2-monitoramento-diario
// Secrets necessários: DUFFEL_API_KEY, SEATS_AERO_API_KEY (opcional), SUPABASE_URL,
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const DUFFEL_API_KEY = Deno.env.get('DUFFEL_API_KEY')
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

// Sem data_inicio/data_fim na intenção (caso de intenções ainda "hipotéticas",
// como a de teste), cai para a mesma janela de validação usada nas Fases 1 e 3.
// TODO: quando o dashboard (Fase 5) permitir cadastrar datas reais, isso deixa
// de ser necessário na maioria dos casos.
const DATA_FALLBACK = '2026-10-15'
const JANELA_MILHAS_FALLBACK = { start_date: '2026-10-01', end_date: '2026-11-30' }

async function buscarOfertaDuffel(origem, destino, data, cabine) {
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
        slices: [{ origin: origem, destination: destino, departure_date: data }],
        passengers: [{ type: 'adult' }],
        cabin_class: cabine,
      },
    }),
  })

  if (!resp.ok) {
    throw new Error(`Duffel respondeu ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json()
  const offers = json.data?.offers ?? []
  if (offers.length === 0) return null

  return offers.reduce((menor, oferta) => (Number(oferta.total_amount) < Number(menor.total_amount) ? oferta : menor))
}

// Soma o preço de cada trecho da rota candidata (interlining virtual: cada trecho
// é uma passagem separada, buscada e comprada independentemente).
async function precificarRota(rota, cabine, dataPartida) {
  let total = 0
  let moeda = null
  const companhias = new Set()

  for (const trecho of rota.trechos) {
    const oferta = await buscarOfertaDuffel(trecho.origem, trecho.destino, dataPartida, cabine)
    if (!oferta) return null // se faltar 1 trecho, a rota inteira não é precificável hoje

    total += Number(oferta.total_amount)
    moeda = moeda ?? oferta.total_currency // TODO: trechos em moedas diferentes não são convertidos, só somados
    if (oferta.owner?.name) companhias.add(oferta.owner.name)
  }

  return { preco: total, moeda, cia_aerea: [...companhias].join(', ') || null }
}

async function buscarMilhas(origem, destino) {
  const params = new URLSearchParams({
    origin_airport: origem,
    destination_airport: destino,
    start_date: JANELA_MILHAS_FALLBACK.start_date,
    end_date: JANELA_MILHAS_FALLBACK.end_date,
    cabins: 'economy',
    order_by: 'lowest_mileage',
    take: '50',
  })

  const resp = await fetch(`https://seats.aero/partnerapi/search?${params}`, {
    headers: { 'Partner-Authorization': SEATS_AERO_API_KEY, Accept: 'application/json' },
  })

  if (!resp.ok) {
    throw new Error(`Seats.aero respondeu ${resp.status}: ${await resp.text()}`)
  }

  const json = await resp.json()
  const linhas = json.data ?? []
  return linhas.filter((l) => l.YAvailable && Number(l.YMileageCost) > 0)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (!DUFFEL_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ erro: 'Faltam secrets: DUFFEL_API_KEY, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const hoje = new Date().toISOString().slice(0, 10)
  const resultados = []

  try {
    const { data: rotas, error: erroRotas } = await supabase
      .from('rotas_candidatas')
      .select('id, trechos, intencao_id, intencoes_viagem(cabine, data_inicio, data_fim)')
      .eq('ativa', true)

    if (erroRotas) throw erroRotas

    for (const rota of rotas ?? []) {
      const intencao = rota.intencoes_viagem
      const cabine = intencao?.cabine ?? 'economy'
      const dataPartida = intencao?.data_inicio ?? DATA_FALLBACK
      const origemGeral = rota.trechos[0]?.origem
      const destinoGeral = rota.trechos[rota.trechos.length - 1]?.destino

      const item = { rota_candidata_id: rota.id, dinheiro: null, milhas: 0, erro_dinheiro: null, erro_milhas: null }

      try {
        const precificado = await precificarRota(rota, cabine, dataPartida)
        if (precificado) {
          const { error } = await supabase.from('price_history').insert({
            rota_candidata_id: rota.id,
            data_consulta: hoje,
            preco: precificado.preco,
            moeda: precificado.moeda,
            cia_aerea: precificado.cia_aerea,
            fonte: 'duffel',
          })
          if (error) throw error
          item.dinheiro = precificado
        }
      } catch (err) {
        item.erro_dinheiro = err instanceof Error ? err.message : String(err)
      }

      if (SEATS_AERO_API_KEY && origemGeral && destinoGeral) {
        try {
          const disponibilidade = await buscarMilhas(origemGeral, destinoGeral)
          if (disponibilidade.length > 0) {
            const { error } = await supabase.from('mileage_history').insert(
              disponibilidade.map((l) => ({
                rota_candidata_id: rota.id,
                data_consulta: hoje,
                programa: l.Source,
                milhas_necessarias: Number(l.YMileageCost),
                taxas_embarque: null, // Seats.aero não retorna taxas nesta API
                assentos_disponiveis: l.YRemainingSeats ?? null,
                fonte: 'seats_aero',
              }))
            )
            if (error) throw error
          }
          item.milhas = disponibilidade.length
        } catch (err) {
          item.erro_milhas = err instanceof Error ? err.message : String(err)
        }
      }

      // Motor 3 avalia distorção logo após os dados novos chegarem — mais fácil
      // manter a checagem sempre em dia do que rodá-la separada depois.
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/motor3-deteccao-distorcao`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ rota_candidata_id: rota.id }),
        })
        const json = await resp.json()
        item.alertas_disparados = json.alertas_disparados ?? 0
      } catch (err) {
        item.erro_motor3 = err instanceof Error ? err.message : String(err)
      }

      resultados.push(item)
    }

    return jsonResponse({ ok: true, rotas_processadas: resultados.length, resultados })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : JSON.stringify(err)
    return jsonResponse({ erro: mensagem }, 500)
  }
})
