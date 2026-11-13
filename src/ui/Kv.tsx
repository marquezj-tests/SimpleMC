import type { ReactNode } from 'react';

/** One "label — value" row of the step window. */
export function Row({ k, v, color }: { k: ReactNode; v: ReactNode; color?: string }) {
  return (
    <div className="kv">
      <span className="kv-k">
        {color && <span className="swatch" style={{ background: color }} />}
        {k}
      </span>
      <span className="kv-v">{v}</span>
    </div>
  );
}
