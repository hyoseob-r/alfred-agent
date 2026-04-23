/**
 * Alfred Proxy Server
 * 버전: 2.0.0
 *
 * 설치: curl -fsSL https://alfred-agent-nine.vercel.app/install.sh | bash
 * 실행: node ~/alfred-proxy/server.js
 *
 * - cloudflared 터널 자동 시작
 * - 터널 URL 자동으로 서버에 등록
 * - Claude.ai 구독으로 동작 (별도 API 크레딧 불필요)
 */

const http = require('http');
const https = require('https');
const { execFile, spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 7432;
const INSTALL_DIR = path.join(os.homedir(), 'alfred-proxy');
const CLAUDE_BIN = '/usr/local/bin/claude';
const CLOUDFLARED_BIN = path.join(INSTALL_DIR, 'cloudflared');
const API_BASE = 'https://alfred-agent-nine.vercel.app';

// GitHub 사용자명 읽기
function getGithubLogin() {
  const configFile = path.join(INSTALL_DIR, '.github_user');
  try {
    return fs.readFileSync(configFile, 'utf8').trim();
  } catch {
    return null;
  }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  }
  return String(content || '');
}

function buildPrompt(messages) {
  if (messages.length === 1) return extractText(messages[0].content);
  return messages.map(m => {
    const role = m.role === 'user' ? 'Human' : 'Assistant';
    return `${role}: ${extractText(m.content)}`;
  }).join('\n\n');
}

// Supabase에 프록시 URL 등록
function registerProxyUrl(proxyUrl) {
  const githubLogin = getGithubLogin();
  if (!githubLogin) {
    console.log('[proxy] GitHub 사용자명 없음 — URL 자동 등록 건너뜀');
    console.log(`[proxy] 수동 등록하려면: echo "YOUR_GITHUB_USERNAME" > ${path.join(INSTALL_DIR, '.github_user')}`);
    return;
  }

  const body = JSON.stringify({ github_login: githubLogin, proxy_url: proxyUrl });
  const url = new URL(`${API_BASE}/api/save-proxy`);
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };

  const req = https.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log(`[proxy] ✅ 등록 완료: ${githubLogin} → ${proxyUrl}`);
    } else {
      console.log(`[proxy] ⚠ 등록 실패: HTTP ${res.statusCode}`);
    }
  });
  req.on('error', (e) => console.error('[proxy] 등록 오류:', e.message));
  req.write(body);
  req.end();
}

// 주기적으로 URL 갱신 (1시간마다 — 만료 방지)
function startHeartbeat(proxyUrl) {
  setInterval(() => registerProxyUrl(proxyUrl), 60 * 60 * 1000);
}

// cloudflared 시작 및 URL 파싱
function startCloudflared(onUrl) {
  if (!fs.existsSync(CLOUDFLARED_BIN)) {
    console.log('[cloudflared] 바이너리 없음. 수동으로 터널을 시작하세요:');
    console.log(`  ${CLOUDFLARED_BIN} tunnel --url http://localhost:${PORT}`);
    return;
  }

  console.log('[cloudflared] 터널 시작 중...');
  const cf = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
  let urlFound = false;

  function checkOutput(data) {
    if (urlFound) return;
    const text = data.toString();
    const match = text.match(urlPattern);
    if (match) {
      urlFound = true;
      const tunnelUrl = match[0];
      console.log(`\n🌐 터널 URL: ${tunnelUrl}\n`);
      onUrl(tunnelUrl);
    }
  }

  cf.stdout.on('data', checkOutput);
  cf.stderr.on('data', checkOutput);

  cf.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[cloudflared] 종료됨 (code ${code}). 5초 후 재시작...`);
      setTimeout(() => startCloudflared(onUrl), 5000);
    }
  });

  process.on('exit', () => cf.kill());
}

// HTTP 서버
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-claude-token');

  if (req.method === 'OPTIONS') return res.writeHead(200).end();

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, version: '2.0.0', message: 'Alfred Proxy running' }));
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let parsed;
    try { parsed = JSON.parse(body); }
    catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }

    const { model, system, messages, max_tokens, stream } = parsed;
    if (!messages?.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'messages required' }));
    }

    const promptText = buildPrompt(messages);
    const targetModel = model || 'claude-sonnet-4-6';

    console.log(`[${new Date().toISOString()}] → model=${targetModel} stream=${!!stream} len=${promptText.length}`);

    // ── 스트리밍 모드 ────────────────────────────────────────────────────────
    if (stream) {
      const streamArgs = ['-p', '--model', targetModel, '--no-session-persistence'];
      if (system) streamArgs.push('--append-system-prompt', system);
      streamArgs.push(promptText);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      const child = spawn(CLAUDE_BIN, streamArgs, {
        cwd: INSTALL_DIR,
        env: { ...process.env, HOME: os.homedir() },
        stdio: ['ignore', 'pipe', 'pipe'],  // stdin 즉시 닫기 (3초 대기 방지)
      });

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const event = JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
        res.write(`data: ${event}\n\n`);
      });

      child.on('close', (code) => {
        console.log(`[${new Date().toISOString()}] stream done (code=${code})`);
        res.write('data: {"type":"message_stop"}\n\n');
        res.end();
      });

      child.on('error', (err) => {
        console.error('[stream error]', err.message);
        res.write(`data: {"type":"error","message":${JSON.stringify(err.message)}}\n\n`);
        res.end();
      });

      res.on('close', () => child.kill());
      return;
    }

    // ── 일반 모드 (JSON 응답) ─────────────────────────────────────────────────
    const args = ['-p', '--output-format', 'json', '--model', targetModel, '--no-session-persistence'];
    if (system) args.push('--append-system-prompt', system);
    args.push(promptText);

    execFile(CLAUDE_BIN, args, {
      timeout: 180000,
      maxBuffer: 20 * 1024 * 1024,
      cwd: INSTALL_DIR,
      env: { ...process.env, HOME: os.homedir() },
    }, (error, stdout) => {
      if (error) {
        console.error('[error]', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { type: 'proxy_error', message: error.message } }));
      }

      let result;
      try { result = JSON.parse(stdout); }
      catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to parse Claude output' }));
      }

      console.log(`[${new Date().toISOString()}] ✓ cost=$${result.total_cost_usd?.toFixed(4) || '?'}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: `msg_proxy_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: result.result || '' }],
        model: targetModel,
        stop_reason: result.stop_reason || 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      }));
    });
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ 포트 ${PORT} 이미 사용 중.\n  pkill -f "alfred-proxy/server.js"\n`);
  } else {
    console.error('서버 오류:', err);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║     Alfred Proxy Server v2.0.0            ║
║  Claude.ai 구독으로 웹앱 API 처리          ║
╚═══════════════════════════════════════════╝
`);

  // cloudflared 터널 자동 시작
  startCloudflared((tunnelUrl) => {
    registerProxyUrl(tunnelUrl);
    startHeartbeat(tunnelUrl);
    console.log('✅ 웹앱에서 자동으로 연결됩니다.\n');
  });
});
