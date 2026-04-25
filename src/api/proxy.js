export const PROXY_URL_KEY = 'alfred_proxy_url';

let _activeProxyUrl = localStorage.getItem(PROXY_URL_KEY) || null;

export function getProxyUrl() { return _activeProxyUrl; }
export function setActiveProxyUrl(url) {
  _activeProxyUrl = url;
  if (url) localStorage.setItem(PROXY_URL_KEY, url);
  else localStorage.removeItem(PROXY_URL_KEY);
}

export async function chatAPI(body) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) throw new Error("프록시 미연결 — 우측 상단 프록시 버튼에서 로컬 프록시를 연결해 주세요.");
  const url = `${proxyUrl.replace(/\/$/, '')}/api/chat`;
  const headers = { "Content-Type": "application/json" };
  const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  return resp.json();
}

export async function streamChatAPI(body, onChunk, signal) {
  const proxyUrl = getProxyUrl();
  const url = proxyUrl ? `${proxyUrl.replace(/\/$/, '')}/api/chat` : '/api/chat';
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
          onChunk(json.delta.text);
        } else if (json.type === "message_stop") {
          return;
        }
      } catch {}
    }
  }
}

export async function testProxyConnection(url) {
  try {
    const resp = await fetch(url.replace(/\/$/, ''), { signal: AbortSignal.timeout(4000) });
    const data = await resp.json();
    return data.ok === true;
  } catch { return false; }
}

export async function fetchProxyUrlFromServer(githubLogin) {
  try {
    const resp = await fetch(`/api/get-proxy?github_login=${encodeURIComponent(githubLogin)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    return data.proxy_url || null;
  } catch { return null; }
}
