import '@tanstack/react-start/server-only'

export const createGroqGuardianModel = (apiKey: string) => ({
  async invoke(messages: unknown): Promise<unknown> {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        temperature: 0,
        reasoning_effort: 'low',
        max_completion_tokens: 2_000,
        response_format: { type: 'json_object' },
        messages
      })
    })
    if (!response.ok) throw new Error(`Groq Guardian request failed (${response.status})`)
    const result = await response.json()
    const content = result.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('Groq Guardian returned no JSON content')
    return JSON.parse(content)
  }
})
