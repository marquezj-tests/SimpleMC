import type { FC, ReactNode } from 'react';
import type { Engine, StepRecordBase, Track } from '../physics/engine';
import type { Dict, Lang } from '../i18n';
import type { Colors } from '../ui/colors';

/** Number input shown in the parameter panel. */
export interface NumberParam {
  key: string;
  type: 'number';
  label: Record<Lang, string>;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  integer?: boolean;
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

/** Geometry drawn by the 2D and 3D views. */
export type Scene =
  | { kind: 'slab'; thickness: number; label: Record<Lang, string>; beamLabel: Record<Lang, string> }
  | { kind: 'sphere'; radius: number; label: Record<Lang, string> };

/** What the step window shows for one step record. */
export interface StepContent {
  kicker: string;
  title: string;
  explanation: string;
  visual?: ReactNode;
  rows?: ReactNode;
}

export interface LegendSpec {
  lines: { color: string; label: string; dashed?: boolean }[];
  markers: { color: string; label: string }[];
}

export interface ResultRow {
  label: string;
  /** Mean value (NaN shows as "—"); sigma given for Monte Carlo estimates. */
  value: number;
  sigma?: number;
  /** Visual emphasis for the main result. */
  main?: boolean;
  /** Colour swatch linking the row to the legend. */
  color?: string;
  /** Start a new group with this heading. */
  heading?: string;
  /** Number of decimals instead of the default significant digits. */
  fixed?: number;
  /** Text shown instead of the number. */
  text?: string;
}

/** A running instance of an example: engine plus everything the UI needs to show it. */
export interface Simulation {
  // The concrete record type depends on the example.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine: Engine<any>;
  scene: Scene;
  /** True when the requested run is complete. */
  isDone(): boolean;
  results(t: Dict, c: Colors): ResultRow[];
  /** Short note under the results heading. */
  resultsNote(t: Dict): string;
  trackStyle(tr: Track, c: Colors): { color: string; dashed: boolean };
  markerColor(kind: string, c: Colors): string;
  legend(t: Dict, c: Colors): LegendSpec;
  stepContent(rec: StepRecordBase | null, t: Dict, lang: Lang, c: Colors): StepContent;
  /** Extra charts shown under the view. */
  Panels?: FC<{ version: number }>;
  /** Extra step-mode buttons (e.g. "Next cycle"). */
  extraControls?: { label: (t: Dict) => string; run: () => StepRecordBase }[];
}

/**
 * A teaching example. New examples are added by implementing this interface
 * and registering them in `examples/index.ts`.
 */
export interface Example {
  id: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  params: Param[];
  defaults: ParamValues;
  /** Paragraphs of the "How it works" section. */
  about: Record<Lang, string[]>;
  /** Extra validation across parameters; returns an error message or null. */
  validate?(values: ParamValues, t: Dict): string | null;
  /** Load data lazily (e.g. large nuclear data tables). */
  load?(): Promise<void>;
  create(values: ParamValues, seed: number): Simulation;
}
