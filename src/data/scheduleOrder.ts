import { db } from "./db";
import { sortedMilestones } from "../lib/milestones";
import { sortedEventWork } from "../lib/eventWork";

export async function reorderSchedule(
  eventId: string,
  kind: "milestone" | "work",
  id: string,
  neighborId: string,
  expectedUpdatedAt: string,
  neighborUpdatedAt: string,
) {
  await db.transaction("rw", db.events, async () => {
    const event = await db.events.get(eventId);
    if (!event) throw new Error("イベントが見つかりません。");
    const source =
      kind === "milestone"
        ? sortedMilestones(event.milestones ?? [])
        : sortedEventWork(event.workItems ?? []);
    const current = source.find((item) => item.id === id);
    const neighbor = source.find((item) => item.id === neighborId);
    if (!current || !neighbor)
      throw new Error("項目が削除されています。一覧を開き直してください。");
    if (
      current.updatedAt !== expectedUpdatedAt ||
      neighbor.updatedAt !== neighborUpdatedAt
    )
      throw new Error("項目が変更されています。一覧を開き直してください。");
    const groupKey = (item: typeof current) =>
      kind === "milestone"
        ? (item.dueDate ?? "")
        : JSON.stringify([
            "milestoneId" in item ? item.milestoneId : undefined,
            item.startDate ?? "",
          ]);
    if (groupKey(current) !== groupKey(neighbor))
      throw new Error("同じ日付・同じマイルストーン内でのみ並べ替えできます。");
    if (id === neighborId) return;
    const group = source.filter((item) => groupKey(item) === groupKey(current));
    const first = group.findIndex((item) => item.id === id);
    const second = group.findIndex((item) => item.id === neighborId);
    [group[first], group[second]] = [group[second], group[first]];
    const positions = new Map(group.map((item, index) => [item.id, index]));
    const now = new Date(
      Math.max(
        Date.now(),
        Date.parse(event.updatedAt) + 1,
        ...group.map((item) => Date.parse(item.updatedAt) + 1),
      ),
    ).toISOString();
    if (kind === "milestone") {
      await db.events.put({
        ...event,
        updatedAt: now,
        milestones: event.milestones!.map((item) =>
          positions.has(item.id)
            ? { ...item, sortOrder: positions.get(item.id)!, updatedAt: now }
            : item,
        ),
      });
    } else {
      await db.events.put({
        ...event,
        updatedAt: now,
        workItems: event.workItems!.map((item) =>
          positions.has(item.id)
            ? { ...item, sortOrder: positions.get(item.id)!, updatedAt: now }
            : item,
        ),
      });
    }
  });
}
