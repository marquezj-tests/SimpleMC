import { useEffect, useState } from 'react';
import type { Example, ParamValues } from '../examples/types';
import { useLang, useT } from '../i18n';

interface Props {
  example: Example;
  values: ParamValues;
  onChange: (v: ParamValues) => void;
  seed: number;
  setSeed: (n: number) => void;
}

/**
 * Inputs are edited as text and applied as soon as the whole set is valid.
 * Applying new values rebuilds the problem and resets the tallies.
 */
export function ParamsPanel({ example, values, onChange, seed, setSeed }: Props) {
  const t = useT();
  const lang = useLang();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [seedText, setSeedText] = useState(String(seed));

  useEffect(() => {
    setDraft(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
  }, [values]);

  const errors: Record<string, boolean> = {};
  const parsed: ParamValues = {};
  for (const p of example.params) {
    const raw = draft[p.key] ?? String(values[p.key]);
    if (p.type === 'select') {
      parsed[p.key] = raw;
    } else {
      const v = Number(raw);
      parsed[p.key] = v;
      if (raw.trim() === '' || !Number.isFinite(v) || v < p.min || v > p.max || (p.integer && !Number.isInteger(v)))
        errors[p.key] = true;
    }
  }
  const crossError = Object.keys(errors).length === 0 ? example.validate?.(parsed, t) ?? null : null;

  const update = (key: string, raw: string) => {
    const next = { ...draft, [key]: raw };
    setDraft(next);
    // apply if everything is valid
    const candidate: ParamValues = {};
    for (const p of example.params) {
      const r = next[p.key] ?? String(values[p.key]);
      if (p.type === 'select') candidate[p.key] = r;
      else {
        const v = Number(r);
        if (r.trim() === '' || !Number.isFinite(v) || v < p.min || v > p.max || (p.integer && !Number.isInteger(v))) return;
        candidate[p.key] = v;
      }
    }
    if (example.validate?.(candidate, t)) return;
    if (example.params.some((p) => candidate[p.key] !== values[p.key])) onChange(candidate);
  };

  return (
    <section className="panel">
      <h2>{t.parameters}</h2>
      {example.params.map((p) => (
        <label key={p.key} className="field">
          <span className="field-label">
            {p.label[lang]}
            {p.type === 'number' && p.unit && <small className="muted"> ({p.unit})</small>}
          </span>
          {p.type === 'select' ? (
            <select value={draft[p.key] ?? String(values[p.key])} onChange={(e) => update(p.key, e.target.value)}>
              {p.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label[lang]}
                </option>
              ))}
            </select>
          ) : (
            <div className="field-row">
              <input
                type="number"
                min={p.min}
                max={p.max}
                step={p.step ?? 'any'}
                value={draft[p.key] ?? ''}
                aria-invalid={errors[p.key] || undefined}
                onChange={(e) => update(p.key, e.target.value)}
              />
              {p.presets && (
                <select
                  className="presets"
                  aria-label={t.presets}
                  value=""
                  onChange={(e) => e.target.value && update(p.key, e.target.value)}
                >
                  <option value="">{t.presets}…</option>
                  {p.presets.map((pr) => (
                    <option key={pr.label} value={pr.value}>
                      {pr.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {errors[p.key] && p.type === 'number' && (
            <small className="error">
              {t.invalid}: {p.min} – {p.max} {p.unit}
            </small>
          )}
        </label>
      ))}
      {crossError && <small className="error">{crossError}</small>}
      <label className="field">
        <span className="field-label">{t.seed}</span>
        <input
          type="number"
          step={1}
          value={seedText}
          onChange={(e) => {
            setSeedText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isInteger(v) && v >= 0) setSeed(v);
          }}
        />
      </label>
    </section>
  );
}
