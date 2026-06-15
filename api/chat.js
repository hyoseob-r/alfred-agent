export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-claude-token',
  };

  if (req.method === 'OPTIONS') {
    res.status(200).set(corsHeaders).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).set(corsHeaders).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = req.body;
    const claudeToken = req.headers['x-claude-token'];
    const authHeaders = claudeToken
      ? { 'Authorization': `Bearer ${claudeToken}` }
      : { 'x-api-key': process.env.ANTHROPIC_API_KEY };

    const isStream = body.stream === true;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        ...authHeaders,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json();
      res.status(response.status).set(corsHeaders).json(data);
      return;
    }

    if (isStream) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
      return;
    }

    const data = await response.json();
    res.status(200).set(corsHeaders).json(data);
  } catch (error) {
    res.status(500).set(corsHeaders).json({ error: error.message || 'Internal server error' });
  }
}
