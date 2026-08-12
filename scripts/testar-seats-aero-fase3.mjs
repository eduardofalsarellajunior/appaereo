// Validação manual da Fase 3: chama a API do Seats.aero para a rota fixa GRU -> NRT.
// Uso: SEATS_AERO_API_KEY=xxx node scripts/testar-seats-aero-fase3.mjs
//
// Mesma lógica da Edge Function em supabase/functions/buscar-milhas-fase3/index.ts,
// só que roda localmente (sem gravar no banco) para confirmar que a chave/chamada funcionam.

const SEATS_AERO_API_KEY = process.env.SEATS_AERO_API_KEY

if (!SEATS_AERO_API_KEY) {
  console.error('Defina SEATS_AERO_API_KEY no ambiente antes de rodar este script.')
  process.exit(1)
}

const params = new URLSearchParams({
  origin_airport: 'GRU',
  destination_airport: 'NRT',
  start_date: '2026-10-01',
  end_date: '2026-11-30',
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
  console.error(`Seats.aero respondeu ${resp.status}:`, await resp.text())
  process.exit(1)
}

const json = await resp.json()
const linhas = json.data ?? []
const comEconomica = linhas.filter((l) => l.YAvailable && Number(l.YMileageCost) > 0)

console.log(`${linhas.length} registro(s) no total, ${comEconomica.length} com disponibilidade em economy para GRU -> NRT`)

for (const l of comEconomica.slice(0, 10)) {
  console.log({
    programa: l.Source,
    data: l.Date,
    milhas: l.YMileageCost,
    assentos: l.YRemainingSeats,
    direto: l.YDirect,
  })
}
