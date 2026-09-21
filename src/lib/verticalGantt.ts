import type { EventWorkItem, MilestonePlan } from "../types";

export interface WorkOverview {
  planned: MilestonePlan;
  baseline: MilestonePlan;
  actual: MilestonePlan;
}
const envelope = (plans: MilestonePlan[]): MilestonePlan => {
  const dates = plans
    .flatMap((plan) => [plan.startDate, plan.dueDate])
    .filter((date): date is string => !!date)
    .sort();
  return dates.length ? { startDate: dates[0], dueDate: dates.at(-1)! } : {};
};

/** The envelope includes gaps between work items; it is not a continuous work estimate. */
export function workOverview(
  items: EventWorkItem[],
  today: string,
): WorkOverview {
  return {
    planned: envelope(items),
    baseline: envelope(
      items.flatMap((item) => (item.baseline ? [item.baseline] : [])),
    ),
    actual: envelope(
      items.map((item) => ({
        startDate: item.actualStartDate,
        dueDate:
          item.completedDate ??
          (item.status === "in_progress" && item.actualStartDate
            ? today
            : undefined),
      })),
    ),
  };
}
