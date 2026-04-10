export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { date, content, tasks } = req.body
  // date: "2026-04-10", content: "- [완료] xxx\n- [완료] yyy"
  // tasks (optional): [{ name, status }] — 진행중인 작업 테이블 업데이트

  if (!content) return res.status(400).json({ error: 'content required' })

  const supabaseUrl = 'https://atwztuelyhwtohylbypv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const userId = process.env.COUNCIL_USER_ID

  if (!serviceKey || !userId) return res.status(500).json({ error: 'Server not configured' })

  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  }

  const entryDate = date || new Date().toISOString().slice(0, 10)
  const title = `WORKLOG_${entryDate}`

  try {
    // 같은 날짜 기존 항목 조회
    const existResp = await fetch(
      `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(title)}&select=id,content`,
      { headers }
    )
    const existing = await existResp.json()

    let finalContent = content
    if (Array.isArray(existing) && existing.length > 0) {
      // 기존 내용에 append
      finalContent = existing[0].content + '\n' + content
    }

    let resp
    if (Array.isArray(existing) && existing.length > 0) {
      resp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ content: finalContent, tags: ['worklog', entryDate] }),
        }
      )
    } else {
      resp = await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          user_id: userId,
          type: 'worklog',
          title,
          content: finalContent,
          tags: ['worklog', entryDate],
        }),
      })
    }

    if (!resp.ok) {
      const err = await resp.text()
      return res.status(500).json({ error: err })
    }

    // tasks 있으면 task_status도 업데이트
    if (tasks && Array.isArray(tasks)) {
      const taskContent = tasks.map(t => `| ${t.name} | ${t.status} | ${entryDate} |`).join('\n')
      const taskTitle = 'WORKLOG_task_status'

      const existTaskResp = await fetch(
        `${supabaseUrl}/rest/v1/context_notes?user_id=eq.${encodeURIComponent(userId)}&title=eq.${encodeURIComponent(taskTitle)}&select=id`,
        { headers }
      )
      const existTask = await existTaskResp.json()

      if (Array.isArray(existTask) && existTask.length > 0) {
        await fetch(
          `${supabaseUrl}/rest/v1/context_notes?id=eq.${existTask[0].id}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ content: taskContent, tags: ['worklog', 'task_status'] }),
          }
        )
      } else {
        await fetch(`${supabaseUrl}/rest/v1/context_notes`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            user_id: userId,
            type: 'worklog',
            title: taskTitle,
            content: taskContent,
            tags: ['worklog', 'task_status'],
          }),
        })
      }
    }

    return res.status(200).json({ ok: true, date: entryDate })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
