'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

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
      {/* Hero section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Rohlik<span>.cz</span> Stats</h1>
          <p className="hero-subtitle">
            Kompletni analyza vasich nakupu na Rohliku. Mesicni utraty, cenove trendy,
            top produkty, kategorie &mdash; vse na jednom miste.
          </p>
          <p className="hero-desc">
            Funkce, kterou Rohlik sam nenabizi. Prihlas se a behem minuty ziskas
            detailni prehled o svych nakupech.
          </p>
        </div>

        <div className="hero-form">
          <div className="landing-card">
            <h2>Zobrazit statistiky</h2>

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
                  Analyzovat nakupy
                </button>
                {error && <div className="error-message">{error}</div>}
                <div className="form-hint">
                  Heslo se nikam neuklada. Pouzije se jednоrazove pro stazeni dat z Rohliku.
                </div>
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
          </div>
        </div>
      </section>

      {/* Screenshots showcase */}
      <section className="showcase">
        <h2>Co vsechno uvidite</h2>
        <div className="showcase-grid">
          <div className="showcase-item showcase-item-wide">
            <Image
              src="/screenshots/overview.png"
              alt="Prehled mesicnich utrat"
              width={1200}
              height={800}
              className="showcase-img"
            />
            <div className="showcase-label">
              <strong>Mesicni utraty</strong>
              <span>Celkovy prehled kolik utracite za nakupy kazdy mesic</span>
            </div>
          </div>
          <div className="showcase-item">
            <Image
              src="/screenshots/categories.png"
              alt="Kategorie produktu"
              width={800}
              height={300}
              className="showcase-img"
            />
            <div className="showcase-label">
              <strong>Kategorie</strong>
              <span>Rozdeleni utrat do kategorii s moznosti zanoreni</span>
            </div>
          </div>
          <div className="showcase-item">
            <Image
              src="/screenshots/product-detail.png"
              alt="Detail produktu"
              width={800}
              height={600}
              className="showcase-img"
            />
            <div className="showcase-label">
              <strong>Detail produktu</strong>
              <span>Historie nakupu a ceny kazdeho produktu</span>
            </div>
          </div>
          <div className="showcase-item showcase-item-wide">
            <Image
              src="/screenshots/price-trend.png"
              alt="Vyvoj ceny"
              width={1200}
              height={400}
              className="showcase-img"
            />
            <div className="showcase-label">
              <strong>Cenove trendy</strong>
              <span>Jak se menila cena vasich oblibenych produktu v case</span>
            </div>
          </div>
        </div>
      </section>

      {/* Story section */}
      <section className="story">
        <h2>Proc tohle existuje</h2>
        <div className="story-content">
          <p>
            Jako pravidelny zakaznik Rohliku jsem chtel mit prehled o svych nakupech &mdash;
            kolik utracim mesicne, ktere produkty kupuju nejcasteji, jak se meni ceny v case.
            Jednoducha vec, kterou by slusny e-shop mel nabizet.
          </p>
          <p>
            Nekolikrat jsem kontaktoval zakaznicku podporu Rohliku s prosbou o tuto funkci.
            Pokazde prisla stejna odpoved: &bdquo;Dekujeme za podnet, predame vyvojovemu tymu.&ldquo;
            Pak nic. Zadna analyza. Zadne statistiky. Jen sliby.
          </p>
          <p>
            Tak jsem si to napsal sam. Nejdriv jako skript pro sebe, pak jako webovou aplikaci
            pro vsechny, kteri chteji vedet, kam jejich penize na Rohliku tečou.
          </p>
          <p>
            Aplikace pouziva vase prihlasovaci udaje <strong>jednоrazove</strong> &mdash; jen pro stazeni
            objednavek pres Rohlik API. Heslo se nikde neuklada. Zpracovana data neobsahuji
            zadne osobni udaje. Kod je kompletne otevreny na GitHubu.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="how-it-works">
        <h2>Jak to funguje</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-text">
              <strong>Prihlaste se</strong>
              <span>Zadejte svoje Rohlik.cz prihlasovaci udaje</span>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-text">
              <strong>Stazeni dat</strong>
              <span>Aplikace stahne historii vasich objednavek (muze trvat minutu)</span>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-text">
              <strong>Analyza</strong>
              <span>Data se zpracuji do prehlednych grafu a tabulek</span>
            </div>
          </div>
          <div className="step">
            <div className="step-number">4</div>
            <div className="step-text">
              <strong>Permalink</strong>
              <span>Dostanete odkaz, na ktery se muzete kdykoliv vratit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-links">
          <a href="https://github.com/kwaczek/rohlik-stats" target="_blank" rel="noopener">
            GitHub
          </a>
          <span className="footer-sep">&middot;</span>
          <span>Open source</span>
          <span className="footer-sep">&middot;</span>
          <span>Hesla se neukladaji</span>
        </div>
        <div className="footer-copy">
          Vytvoreno, protoze Rohlik tuto funkci nema a podpora ji opakovaně slibila.
        </div>
      </footer>
    </div>
  );
}
