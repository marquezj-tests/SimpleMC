import type { Problem } from '../physics/transport';
import type { Dict, Lang } from '../i18n';

/** Number input shown in the parameter panel. */
export interface NumberParam {
  key: string;
  type: 'number';
  label: Record<Lang, string>;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  presets?: { label: string; value: number }[];
}

export interface SelectParam {
  key: string;
  type: 'select';
  label: Record<Lang, string>;
  options: { value: string; label: Record<Lang, string> }[];
}

export type Param = NumberParam | SelectParam;
export type ParamValues = Record<string, number | string>;

/**
 * A teaching example: a geometry, source and tally built from user
 * parameters. New examples are added by implementing this interface and
 * registering them in `examples/index.ts`.
 */
export interface Example {
  id: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  params: Param[];
  defaults: ParamValues;
  build(values: ParamValues): Problem;
  /** Extra validation across parameters; returns an error message or null. */
  validate?(values: ParamValues, t: Dict): string | null;
  /** Rows of the results panel. */
  results(problem: Problem, values: ParamValues, t: Dict): ResultRow[];
}

export interface ResultRow {
  label: string;
  /** Mean value; sigma given for Monte Carlo estimates. */
  value: number;
  sigma?: number;
  /** Visual emphasis for the main result. */
  main?: boolean;
  /** Colour swatch linking the row to the legend. */
  color?: string;
}
