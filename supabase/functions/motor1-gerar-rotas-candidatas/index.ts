// Motor 1 — geração de rotas candidatas (grafo de hubs + MCT).
//
// Dispara quando uma `intencao_viagem` é criada/editada (não diariamente). Nesta
// fase não há UI de cadastro (Fase 5), então a função é chamada manualmente com
// { intencao_id }; quando o dashboard existir, ele chama isto logo após salvar
// a intenção.
//
// Gera TODAS as combinações origem -> [hub1] -> [hub2] -> destino permitidas por
// `max_escalas`, cruzando hubs de regiões diferentes nas rotas de 2 escalas (evita
// absurdos como DXB -> DOH -> DXB, hubs vizinhos da mesma região). Isso produz
// centenas/milhares de linhas por intenção — de propósito: elas entram com
// `ativa = false`, e cabe a você ativar manualmente as que fazem sentido (ver
// especificação técnica, seção 6: "limitar manualmente a N melhores candidatas").
// O Motor 2 (Fase 3-4) só processa rotas com `ativa = true`.
//
// Deploy: supabase functions deploy motor1-gerar-rotas-candidatas
// Secrets necessários: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

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

// Lista curada por região (especificação técnica, seção 6, exemplo BR<->Ásia).
// TODO: quando houver intenções para outras regiões (ex. BR->Europa), adicionar
// os grupos correspondentes aqui (ex. europa: ['LHR','CDG','FRA','AMS','MAD']).
const HUBS_POR_REGIAO = {
  oriente_medio: ['DXB', 'DOH', 'AUH'],
  eua: ['LAX', 'IAH', 'DFW', 'ORD'],
  asia: ['ICN', 'PVG', 'HKG', 'SIN', 'TPE'],
}

// MCT mínimo (minutos) por tipo de troca — mais conservador que o MCT oficial de
// interline, já que não há garantia de reacomodação entre companhias diferentes.
// TODO(Fase 3-4): o Motor 1 só gera topologia (pares de aeroportos), sem horários
// reais de voo — não há como validar o MCT de verdade ainda. Isso vira exigível
// quando o Motor 2 tiver os horários de cada trecho via Duffel; por ora todo
// candidato nasce com mct_respeitado = true.
const MCT_MINUTOS = {
  domestico_domestico: 60,
  domestico_internacional: 90,
  internacional_internacional: 90,
  troca_terminal: 150,
}

function leg(origem, destino) {
  return { origem, destino, cia_sugerida: null }
}

function gerarCombinacoes(origens, destinos, maxEscalas) {
  const combos = []
  const regioes = Object.entries(HUBS_POR_REGIAO)
  const todosHubs = Object.values(HUBS_POR_REGIAO).flat()

  for (const origem of origens) {
    for (const destino of destinos) {
      if (origem === destino) continue

      // 0 escalas: direto
      combos.push({ trechos: [leg(origem, destino)], hubs_intermediarios: [], num_escalas: 0 })

      // 1 escala: origem -> hub -> destino
      if (maxEscalas >= 1) {
        for (const hub of todosHubs) {
          if (hub === origem || hub === destino) continue
          combos.push({
            trechos: [leg(origem, hub), leg(hub, destino)],
            hubs_intermediarios: [hub],
            num_escalas: 1,
          })
        }
      }

      // 2 escalas: origem -> hub1 -> hub2 -> destino, hub1 e hub2 de regiões diferentes
      if (maxEscalas >= 2) {
        for (const [regiaoA, hubsA] of regioes) {
          for (const [regiaoB, hubsB] of regioes) {
            if (regiaoA === regiaoB) continue
            for (const hub1 of hubsA) {
              if (hub1 === origem || hub1 === destino) continue
              for (const hub2 of hubsB) {
                if (hub2 === origem || hub2 === destino || hub2 === hub1) continue
                combos.push({
                  trechos: [leg(origem, hub1), leg(hub1, hub2), leg(hub2, destino)],
                  hubs_intermediarios: [hub1, hub2],
                  num_escalas: 2,
                })
              }
            }
          }
        }
      }
    }
  }

  return combos
}

function chaveTrechos(trechos) {
  return trechos.map((t) => `${t.origem}-${t.destino}`).join('>')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ erro: 'Faltam secrets: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  try {
    const { intencao_id } = await req.json()
    if (!intencao_id) {
      return jsonResponse({ erro: 'Informe intencao_id no corpo da requisição' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: intencao, error: erroIntencao } = await supabase
      .from('intencoes_viagem')
      .select('id, origens, destinos, max_escalas')
      .eq('id', intencao_id)
      .single()

    if (erroIntencao || !intencao) {
      return jsonResponse({ erro: `Intenção não encontrada: ${erroIntencao?.message ?? intencao_id}` }, 404)
    }

    const { data: existentes, error: erroExistentes } = await supabase
      .from('rotas_candidatas')
      .select('trechos')
      .eq('intencao_id', intencao_id)

    if (erroExistentes) throw erroExistentes

    const chavesExistentes = new Set((existentes ?? []).map((r) => chaveTrechos(r.trechos)))

    const geradas = gerarCombinacoes(intencao.origens, intencao.destinos, intencao.max_escalas)
    const novas = geradas.filter((c) => !chavesExistentes.has(chaveTrechos(c.trechos)))

    const linhas = novas.map((c) => ({
      intencao_id,
      trechos: c.trechos,
      hubs_intermediarios: c.hubs_intermediarios,
      num_escalas: c.num_escalas,
      mct_respeitado: true,
      ativa: false, // curadoria manual antes de entrar no Motor 2 — ver comentário no topo do arquivo
    }))

    const TAMANHO_LOTE = 500
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
      const lote = linhas.slice(i, i + TAMANHO_LOTE)
      const { error } = await supabase.from('rotas_candidatas').insert(lote)
      if (error) throw error
    }

    return jsonResponse({
      ok: true,
      combinacoes_geradas: geradas.length,
      combinacoes_inseridas: linhas.length,
      combinacoes_ja_existentes: geradas.length - linhas.length,
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : JSON.stringify(err)
    return jsonResponse({ erro: mensagem }, 500)
  }
})
