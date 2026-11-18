"use client";

import { useRef, useState, type ReactNode } from "react";
import { NUMERIC_METRICS, type MetricKey } from "@/lib/statistics";

const chartTypes = {
  series: "Readings over time",
  distribution: "Distribution",
  scatter: "Scatter and regression",
  patterns: "Time patterns",
  rolling: "Rolling AQI averages",
} as const;

export type ChartConfig = { type: keyof typeof chartTypes; metric: MetricKey; xMetric: MetricKey; secondMetric?: MetricKey };
type DefaultChart = "series" | "distribution";
type Panel = { id: number; config: ChartConfig; full: boolean; original?: DefaultChart };
const initialConfig: ChartConfig = { type: "series", metric: "aqi", xMetric: "temperature_c" };
const labels = new Map(NUMERIC_METRICS.map(metric => [metric.key, metric.label]));

export function ChartWorkspace({ render, defaults, dataset }: {
  render: (config: ChartConfig) => ReactNode;
  defaults: Record<DefaultChart, { config: ChartConfig; controls: ReactNode; chart: ReactNode }>;
  dataset: string;
}) {
  const [panels, setPanels] = useState<Panel[]>([
    { id: 1, config: initialConfig, full: false, original: "series" },
    { id: 2, config: { ...initialConfig, type: "distribution" }, full: false, original: "distribution" },
  ]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState(initialConfig);
  const ids = useRef(2);
  const dialog = useRef<HTMLDialogElement>(null);

  function open(panel?: Panel) {
    setEditing(panel?.id ?? null);
    setDraft(panel?.original ? defaults[panel.original].config : panel?.config ?? initialConfig);
    dialog.current?.showModal();
  }

  function move(index: number, offset: number) {
    setPanels(current => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  return <>
    <div className="chart-workspace-actions"><button type="button" className="button secondary" onClick={() => open()}>Add chart</button></div>
    {panels.map((panel, index) => {
      const original = panel.original ? defaults[panel.original] : undefined;
      const config = original?.config ?? panel.config;
      const { type, metric, xMetric, secondMetric } = config;
      const variables = type === "series" && secondMetric && secondMetric !== metric
        ? `${labels.get(metric)} and ${labels.get(secondMetric)}` : labels.get(metric);
      const title = type === "scatter" ? `${labels.get(metric)} vs ${labels.get(xMetric)}`
        : type === "series" || type === "distribution" ? `${variables} · ${chartTypes[type]}` : chartTypes[type];
      return <article className={`chart-panel ${panel.full ? "span-12" : "span-6"}`} key={panel.id}>
        <div className="chart-heading">
          <h3>{title}</h3>
          <details className="chart-panel-menu">
            <summary aria-label={`Options for ${title}`}>Options</summary>
            <div>
              <button type="button" onClick={() => open(panel)}>Change</button>
              <button type="button" onClick={() => {
                const id = ++ids.current;
                setPanels(current => [...current.slice(0, index + 1), { id, config, full: panel.full }, ...current.slice(index + 1)]);
              }}>Duplicate</button>
              <button type="button" onClick={() => setPanels(current => current.map(item => item.id === panel.id ? { ...item, full: !item.full } : item))}>{panel.full ? "Half width" : "Full width"}</button>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button>
              <button type="button" disabled={index === panels.length - 1} onClick={() => move(index, 1)}>Move down</button>
              <button type="button" onClick={() => setPanels(current => current.filter(item => item.id !== panel.id))}>Remove</button>
            </div>
          </details>
        </div>
        {original?.controls}
        {original ? original.chart : render(config)}
        <p className="plain-caption workspace-source">{dataset}</p>
      </article>;
    })}
    <dialog ref={dialog} className="chart-builder" aria-label={editing === null ? "Add chart" : "Change chart"}>
      <form onSubmit={event => {
        event.preventDefault();
        if (editing === null) {
          const id = ++ids.current;
          setPanels(current => [...current, { id, config: draft, full: false }]);
        } else {
          setPanels(current => current.map(item => item.id === editing ? { ...item, config: draft, original: undefined } : item));
        }
        dialog.current?.close();
      }}>
        <h3>{editing === null ? "Add chart" : "Change chart"}</h3>
        <label>Chart type<select value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as ChartConfig["type"] })}>
          {Object.entries(chartTypes).map(([type, label]) => <option value={type} key={type}>{label}</option>)}
        </select></label>
        {draft.type === "scatter" && <MetricSelect label="X axis" value={draft.xMetric} change={xMetric => setDraft({ ...draft, xMetric })} />}
        {["series", "distribution", "scatter"].includes(draft.type) && <MetricSelect label={draft.type === "scatter" ? "Y axis" : "Variable"} value={draft.metric} change={metric => setDraft({ ...draft, metric })} />}
        {draft.type === "series" && <label>Second variable<select value={draft.secondMetric ?? ""} onChange={event => setDraft({ ...draft, secondMetric: (event.target.value || undefined) as MetricKey | undefined })}>
          <option value="">None</option>
          {NUMERIC_METRICS.filter(metric => metric.key !== draft.metric).map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
        </select></label>}
        <div className="filter-sheet-actions">
          <button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="button primary">{editing === null ? "Add chart" : "Apply"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

function MetricSelect({ label, value, change }: { label: string; value: MetricKey; change: (key: MetricKey) => void }) {
  return <label>{label}<select value={value} onChange={event => change(event.target.value as MetricKey)}>
    {NUMERIC_METRICS.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
  </select></label>;
}
