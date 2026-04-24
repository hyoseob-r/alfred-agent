export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-claude-token',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const claudeToken = req.headers.get('x-claude-token');
  const authHeaders = claudeToken
    ? { 'Authorization': `Bearer ${claudeToken}` }
    : { 'x-api-key': process.env.ANTHROPIC_API_KEY };

  try {
    const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: {
        'anthropic-version': '2023-06-01',
        ...authHeaders,
      },
    });
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
