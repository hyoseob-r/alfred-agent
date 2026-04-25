import { useState } from "react";
import { fetchProxyUrlFromServer, testProxyConnection, setActiveProxyUrl, getProxyUrl } from "../api/proxy";

export default function ProxyStatusModal({ onClose, githubLogin, proxyUrl, onDetected }) {
  const [status, setStatus] = useState('idle'); // idle | checking | ok | fail
  const [detectedUrl, setDetectedUrl] = useState(proxyUrl || '');
  const [manualUrl, setManualUrl] = useState('');

  const check = async () => {
    setStatus('checking');
    if (githubLogin) {
      const serverUrl = await fetchProxyUrlFromServer(githubLogin);
      if (serverUrl) {
        const alive = await testProxyConnection(serverUrl);
        if (alive) {
          setDetectedUrl(serverUrl);
          setActiveProxyUrl(serverUrl);
          onDetected(serverUrl);
          setStatus('ok');
          return;
        }
      }
    }
    const cached = getProxyUrl();
    if (cached) {
      const alive = await testProxyConnection(cached);
      if (alive) {
        setDetectedUrl(cached);
        setActiveProxyUrl(cached);
        onDetected(cached);
        setStatus('ok');
        return;
      }
    }
    setStatus('fail');
  };

  const connectManual = async () => {
    const url = manualUrl.trim().replace(/\/$/, '');
    if (!url) return;
    setStatus('checking');
    const alive = await testProxyConnection(url);
    if (alive) {
      setDetectedUrl(url);
      setActiveProxyUrl(url);
      onDetected(url);
      setStatus('ok');
    } else {
      setStatus('fail');
    }
  };

  const disconnect = () => {
    setActiveProxyUrl(null);
    setDetectedUrl('');
    onDetected(null);
    onClose();
  };

  const installCmd = `curl -fsSL https://alfred-agent-nine.vercel.app/install.sh | bash`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '28px', width: '500px', maxWidth: '94vw', fontFamily: "'Pretendard', sans-serif" }}>
        <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>프록시 연결</div>
        <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '20px' }}>
          Claude.ai 구독으로 웹앱 사용 — 별도 API 크레딧 불필요
        </div>

        {proxyUrl ? (
          <div style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid #059669', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600', marginBottom: '2px' }}>⚡ 연결됨</div>
              <div style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace', wordBreak: 'break-all' }}>{proxyUrl}</div>
            </div>
            <button onClick={disconnect} style={{ marginLeft: '12px', padding: '4px 10px', background: '#fff', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#dc2626', whiteSpace: 'nowrap' }}>해제</button>
          </div>
        ) : (
          <div style={{ background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
              {status === 'checking' ? '🔍 감지 중...' : status === 'fail' ? '⚠ 프록시 실행 중이 아닙니다.' : '프록시가 연결되지 않았습니다.'}
            </div>
            <button onClick={check} disabled={status === 'checking'}
              style={{ padding: '6px 14px', background: '#111', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: status === 'checking' ? 'not-allowed' : 'pointer', color: '#fff' }}>
              {status === 'checking' ? '감지 중...' : '자동 감지'}
            </button>
          </div>
        )}

        {!proxyUrl && (
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>URL 직접 입력</div>
            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>터미널에서 프록시 실행 후 나오는 <b>trycloudflare.com</b> 주소를 붙여넣으세요.</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input value={manualUrl} onChange={e => setManualUrl(e.target.value)}
                placeholder="https://xxxx.trycloudflare.com"
                style={{ flex: 1, padding: '7px 10px', border: '1px solid #e0e0e0', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }} />
              <button onClick={connectManual} disabled={!manualUrl.trim() || status === 'checking'}
                style={{ padding: '7px 14px', background: '#111', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', color: '#fff', whiteSpace: 'nowrap' }}>
                연결
              </button>
            </div>
          </div>
        )}
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '10px' }}>처음 설치하는 경우</div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>터미널에서 아래 명령어를 실행하세요 (한 번만):</div>
          <div style={{ background: '#111', borderRadius: '8px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px', color: '#88ff88', wordBreak: 'break-all', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flex: 1 }}>{installCmd}</span>
            <button onClick={() => navigator.clipboard.writeText(installCmd)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '4px', padding: '3px 8px', color: '#ccc', fontSize: '10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>복사</button>
          </div>
          <div style={{ fontSize: '11px', color: '#aaa', lineHeight: 1.5 }}>
            설치 후 자동으로 Mac 시작 시 실행됩니다.<br />
            이 화면에서 <b>자동 감지</b> 버튼을 누르면 바로 연결됩니다.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose}
            style={{ padding: '8px 20px', background: '#f5f5f5', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#555' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
