// 일회성 DB 셋업 엔드포인트
// GET /api/setup-db 한 번 호출하면 필요한 테이블 생성
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return res.status(500).json({ error: 'Server not configured' })

  // Supabase Management API로 SQL 실행
  const projectRef = 'atwztuelyhwtohylbypv'
  const sql = `
    CREATE TABLE IF NOT EXISTS user_proxies (
      github_login TEXT PRIMARY KEY,
      proxy_url TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE user_proxies DISABLE ROW LEVEL SECURITY;
  `

  // Try via pg function (if exists)
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ sql }),
  }).catch(() => null)

  // Check if table already exists via REST
  const checkResp = await fetch(
    `${supabaseUrl}/rest/v1/user_proxies?limit=1`,
    {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    }
  )

  if (checkResp.ok) {
    return res.status(200).json({ ok: true, message: 'user_proxies table exists' })
  }

  // Table doesn't exist — return SQL to run manually
  return res.status(200).json({
    ok: false,
    message: 'Table does not exist. Run this SQL in Supabase Dashboard > SQL Editor:',
    sql: sql.trim(),
    dashboard: `https://supabase.com/dashboard/project/${projectRef}/sql`,
  })
}
