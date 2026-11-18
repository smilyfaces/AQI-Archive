import { Tooltip, type TooltipProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export function ChartTooltip(props: TooltipProps<ValueType, NameType>) {
  return <Tooltip {...props} contentStyle={{
    background: "var(--surface)",
    color: "var(--ink)",
    border: "var(--hairline) solid var(--border)",
    borderRadius: "var(--r-sm)",
    fontSize: "var(--text-label)",
  }} />;
}
