const RECEIPT_SCAN_URL = 'https://whiny-idealist-unseen.ngrok-free.dev/webhook/receipt-scan'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: true, message: 'method not allowed' })
    return
  }

  try {
    const upstream = await fetch(RECEIPT_SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    console.error('[scan-receipt] upstream call failed:', err.message)
    res.status(502).json({ error: true, message: 'receipt scan upstream failed' })
  }
}
