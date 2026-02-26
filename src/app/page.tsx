'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'loading' | 'error';

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase('loading');
    setError('');
    setProgress('Prihlasovani...');
    setProgressPct(0);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            if (currentEvent === 'progress') {
              setProgress(data.message);
              if (data.total > 0) {
                setProgressPct(Math.round((data.current / data.total) * 100));
              }
            } else if (currentEvent === 'complete') {
              router.push(data.url);
              return;
            } else if (currentEvent === 'error') {
              setPhase('error');
              setError(data.message);
              return;
            }
          }
        }
      }
    } catch {
      setPhase('error');
      setError('Pripojeni selhalo. Zkuste to znovu.');
    }
  }, [email, password, router]);

  return (
    <div className="landing">
      <div className="landing-card">
        <h1>Rohlik<span>.cz</span> Stats</h1>
        <p>
          Analyza vasich nakupu na Rohliku — mesicni utraty, top produkty,
          kategorie, cenove trendy. Funkce, kterou Rohlik sam nenabizi.
        </p>

        {phase === 'idle' || phase === 'error' ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
              />
            </div>
            <div className="form-group">
              <label>Heslo</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="submit-btn">
              Zobrazit statistiky
            </button>
            {error && <div className="error-message">{error}</div>}
          </form>
        ) : (
          <div className="progress-wrap">
            <div className="progress-message">{progress}</div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.max(progressPct, 5)}%` }}
              />
            </div>
          </div>
        )}

        <div className="landing-footer">
          Open source · Hesla se neukladaji · Kod na{' '}
          <a href="https://github.com" target="_blank" rel="noopener">
            GitHubu
          </a>
          <br />
          Vytvoreno, protoze Rohlik tuto funkci nema a podpora ji opakovaně slibila.
        </div>
      </div>
    </div>
  );
}
