import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EXAMPLES } from './examples';
import type { ParamValues } from './examples/types';
import { DICTS, LangContext, type Lang } from './i18n';
import type { StepRecordBase } from './physics/engine';
import { ParamsPanel } from './ui/ParamsPanel';
import { ResultsPanel } from './ui/ResultsPanel';
import { StepWindow } from './ui/StepWindow';
import { TrackView2D } from './ui/TrackView2D';
import { Legend } from './ui/Legend';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { TrackView3DCanvas } from './ui/TrackView3DCanvas';
import { useColors } from './ui/colors';
import { FlagAR, FlagUK } from './ui/Flags';

// three.js is only downloaded when the 3D view is opened
const TrackView3D = lazy(() => import('./ui/TrackView3D').then((m) => ({ default: m.TrackView3D })));

/** Example shown when the page opens. */
const DEFAULT_EXAMPLE = 'godiva';

type Mode = 'auto' | 'step';
type View = '2d' | '3d';

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Parse the manual ξ field: empty → null, otherwise a list of numbers in [0, 1). */
function parseXi(text: string): number[] | null | 'error' {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (!parts.length) return null;
  const vals = parts.map(Number);
  return vals.every((v) => Number.isFinite(v) && v >= 0 && v < 1) ? vals : 'error';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (store.get('simplemc.lang') === 'es' ? 'es' : 'en'));
  const t = DICTS[lang];
  const colors = useColors();
  const [exampleId, setExampleId] = useState(DEFAULT_EXAMPLE);
  const example = EXAMPLES.find((e) => e.id === exampleId) ?? EXAMPLES[0];
  const [values, setValues] = useState<ParamValues>(example.defaults);
  const [seed, setSeed] = useState(12345);
  const [maxTracks, setMaxTracks] = useState(200);
  const [mode, setMode] = useState<Mode>('step');
  const [view, setView] = useState<View>('2d');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(55);
  const [showWindow, setShowWindow] = useState(true);
  const [record, setRecord] = useState<StepRecordBase | null>(null);
  const [xiText, setXiText] = useState('');
  const [version, setVersion] = useState(0);
  const [resetCount, setResetCount] = useState(0);
  /** Why the 3D view is unavailable, if it is. */
  const [view3dError, setView3dError] = useState<null | 'unsupported' | 'lost' | 'crash'>(null);

  useEffect(() => {
    store.set('simplemc.lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // Examples with large data load it on first use
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const ready = !example.load || loaded[example.id];
  useEffect(() => {
    if (!example.load || loaded[example.id]) return;
    let alive = true;
    example.load().then(() => alive && setLoaded((l) => ({ ...l, [example.id]: true })));
    return () => {
      alive = false;
    };
  }, [example, loaded]);

  const sim = useMemo(
    () => (ready ? example.create(values, seed) : null),
    [example, values, seed, resetCount, ready], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const engine = sim?.engine ?? null;
  if (engine) engine.maxTracks = maxTracks;


  /** Engine state saved just before the step on screen, so it can be redone with another ξ. */
  const before = useRef<unknown>(null);
  /** ξ values the step on screen actually used. */
  const usedXi = record?.xi.map((x) => x.xi) ?? [];
  const canEditXi = !running && before.current !== null && usedXi.length > 0;
  const xiParsed = parseXi(xiText);
  const xiError = canEditXi && (xiParsed === 'error' || (Array.isArray(xiParsed) && xiParsed.length > usedXi.length));

  // Refs so that the animation loop sees current values without restarting.
  const live = useRef({ mode, speed });
  live.current = { mode, speed };

  /** Show a step record and put the ξ it used in the editable field. */
  const show = useCallback((rec: StepRecordBase | null) => {
    setRecord(rec);
    setXiText(rec ? rec.xi.map((x) => x.xi.toFixed(4)).join(', ') : '');
  }, []);

  /** One step in step-by-step mode; remembers the state before it if it uses random numbers. */
  const stepOnce = useCallback((): StepRecordBase => {
    const e = engine!;
    before.current = e.nextXiCount > 0 ? e.saveState() : null;
    return e.step();
  }, [engine]);

  /** The user typed a ξ for the step on screen: redo that step with it. */
  const changeXi = (text: string) => {
    setXiText(text);
    const vals = parseXi(text);
    if (!engine || !canEditXi || !Array.isArray(vals) || vals.length > usedXi.length) return;
    // values not typed keep the ones generated originally
    const xi = usedXi.map((v, i) => vals[i] ?? v);
    setRecord(engine.redoStep(before.current, xi));
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    before.current = null;
    show(null);
    setRunning(false);
    setVersion((v) => v + 1);
  }, [engine, show]);

  const nextStep = () => {
    if (!engine || sim?.isDone()) return;
    setRunning(false);
    setShowWindow(true);
    show(stepOnce());
    setVersion((v) => v + 1);
  };

  const nextParticle = () => {
    if (!engine || sim?.isDone()) return;
    setRunning(false);
    const rec = engine.finishHistory();
    before.current = null;
    show(rec);
    setVersion((v) => v + 1);
  };

  const runExtra = (run: () => StepRecordBase) => {
    if (!engine || sim?.isDone()) return;
    setRunning(false);
    const rec = run();
    before.current = null;
    show(rec);
    setVersion((v) => v + 1);
  };

  const reset = () => {
    setRunning(false);
    setResetCount((n) => n + 1);
  };

  // Continuous run
  useEffect(() => {
    if (!running || !engine || !sim) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const { mode: m, speed: sp } = live.current;
      let changed = false;
      let latest: StepRecordBase | null = null;
      const done = () => sim.isDone();
      if (m === 'step' || sp < 40) {
        // animated: a number of elementary steps per second
        const sps = m === 'step' ? 0.5 * Math.pow(60, sp / 100) : 2 * Math.pow(100, sp / 40);
        acc += (dt * sps) / 1000;
        while (acc >= 1 && !done()) {
          if (m === 'step') latest = stepOnce();
          else {
            engine.step();
            before.current = null;
          }
          acc -= 1;
          changed = true;
        }
      } else {
        // fast: whole histories per frame, within a time budget
        const perFrame = Math.round(Math.pow(10, ((sp - 40) / 60) * 3.5));
        const t0 = performance.now();
        before.current = null;
        if (!engine.atHistoryStart) engine.finishHistory();
        for (let i = 0; i < perFrame && !done() && performance.now() - t0 < 14; i++) engine.finishHistory();
        changed = true;
      }
      if (latest && m === 'step') show(latest);
      if (changed) setVersion((v) => v + 1);
      if (done()) {
        setRunning(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, engine, sim, stepOnce, show]);

  const reachedTarget = sim?.isDone() ?? false;
  const runButton = (
    <button
      className="btn primary"
      onClick={() => setRunning((r) => !r)}
      disabled={!running && reachedTarget}
      title={!running && reachedTarget ? t.runComplete : undefined}
    >
      {running ? `❚❚ ${t.pause}` : `▶ ${t.run}`}
    </button>
  );
  const stepControls = (
    <>
      <button className="btn" onClick={nextStep} disabled={reachedTarget}>
        {t.nextStep} ›
      </button>
      <button className="btn" onClick={nextParticle} disabled={reachedTarget}>
        {t.nextParticle} »
      </button>
      {sim?.extraControls?.map((x) => (
        <button key={x.label(t)} className="btn" onClick={() => runExtra(x.run)} disabled={reachedTarget}>
          {x.label(t)} »»
        </button>
      ))}
      {runButton}
    </>
  );

  const showCurrent = mode === 'step' || speed < 40;

  return (
    <LangContext.Provider value={lang}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <h1>{t.appTitle}</h1>
            <span className="subtitle">{t.appSubtitle}</span>
          </div>
          <div className="topbar-right">
            <label className="inline">
              <span>{t.example}</span>
              <select
                value={exampleId}
                onChange={(e) => {
                  const ex = EXAMPLES.find((x) => x.id === e.target.value)!;
                  setExampleId(ex.id);
                  setValues(ex.defaults);
                }}
              >
                {EXAMPLES.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title[lang]}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented" role="group" aria-label={t.language}>
              {(['en', 'es'] as const).map((l) => (
                <button
                  key={l}
                  className={`lang-btn ${lang === l ? 'on' : ''}`}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  aria-label={l === 'en' ? 'English' : 'Español'}
                  title={l === 'en' ? 'English' : 'Español'}
                >
                  {l === 'en' ? <FlagUK /> : <FlagAR />}
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="layout">
          <aside className="sidebar">
            <p className="example-desc">{example.description[lang]}</p>
            <ParamsPanel
              example={example}
              values={values}
              onChange={(v) => setValues(v)}
              seed={seed}
              setSeed={setSeed}
            />
            {sim && <ResultsPanel rows={sim.results(t, colors)} note={sim.resultsNote(t)} version={version} />}
          </aside>

          <section className="stage">
            <div className="toolbar">
              <div className="segmented" role="group" aria-label={t.mode}>
                <button className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')} aria-pressed={mode === 'auto'}>
                  {t.modeAuto}
                </button>
                <button className={mode === 'step' ? 'on' : ''} onClick={() => setMode('step')} aria-pressed={mode === 'step'}>
                  {t.modeStep}
                </button>
              </div>
              <div className="segmented" role="group" aria-label={t.view}>
                <button className={view === '2d' ? 'on' : ''} onClick={() => setView('2d')} aria-pressed={view === '2d'}>
                  {t.view2d}
                </button>
                <button className={view === '3d' ? 'on' : ''} onClick={() => setView('3d')} aria-pressed={view === '3d'}>
                  {t.view3d}
                </button>
              </div>
              <div className="controls">
                {mode === 'step' ? stepControls : runButton}
                <button className="btn ghost" onClick={reset}>
                  ↺ {t.reset}
                </button>
              </div>
              <label className="slider">
                <span>
                  {t.speed} <small className="muted">({t.slow} → {t.fast})</small>
                </span>
                <input type="range" min={0} max={100} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
              </label>
              <label className="inline small">
                <span>{t.tracksShown}</span>
                <select value={maxTracks} onChange={(e) => setMaxTracks(Number(e.target.value))}>
                  {[20, 50, 100, 200, 500, 1000].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {mode === 'step' && !showWindow && (
                <button className="btn ghost" onClick={() => setShowWindow(true)}>
                  {t.showStepWindow}
                </button>
              )}
            </div>

            <div className="viewport">
              {!sim || !engine ? (
                <div className="view-loading">{t.loadingData}</div>
              ) : view === '2d' ? (
                <TrackView2D engine={engine} sim={sim} scene={sim.scene} version={version} showCurrent={showCurrent} />
              ) : view3dError ? (
                // WebGL unavailable or failed: same view drawn with the plain 2D canvas
                <TrackView3DCanvas engine={engine} sim={sim} scene={sim.scene} version={version} showCurrent={showCurrent} />
              ) : (
                <ErrorBoundary
                  fallback={() => {
                    // report after render; the boundary shows nothing meanwhile
                    queueMicrotask(() => setView3dError((e) => e ?? 'crash'));
                    return null;
                  }}
                >
                  <Suspense fallback={<div className="view3d loading">…</div>}>
                    <TrackView3D
                      engine={engine}
                      sim={sim}
                      scene={sim.scene}
                      version={version}
                      showCurrent={showCurrent}
                      onFail={(reason) => setView3dError(reason)}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
            {sim && <Legend spec={sim.legend(t, colors)} />}
            {sim?.Panels && <sim.Panels version={version} />}

            <details className="about">
              <summary>{t.about}</summary>
              {example.about[lang].map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </details>
          </section>
        </main>

        <footer className="footer">
          <span>
            {t.dataSource}:{' '}
            <a href="https://physics.nist.gov/xcom" target="_blank" rel="noreferrer">
              NIST XCOM
            </a>{' '}
            · {t.dataSourceNeutron}:{' '}
            <a href="https://www.nndc.bnl.gov/endf-b7.1/" target="_blank" rel="noreferrer">
              ENDF/B-VII.1 (NNDC)
            </a>
            , {t.processedWith}{' '}
            <a href="https://openmc.org" target="_blank" rel="noreferrer">
              OpenMC
            </a>
          </span>
        </footer>

        {mode === 'step' && showWindow && sim && (
          <StepWindow
            record={record}
            content={sim.stepContent(record, t, lang, colors)}
            xiText={xiText}
            setXiText={changeXi}
            xiEditable={canEditXi}
            xiError={xiError}
            controls={stepControls}
            onClose={() => setShowWindow(false)}
          />
        )}
      </div>
    </LangContext.Provider>
  );
}
