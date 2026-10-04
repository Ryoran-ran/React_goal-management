import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DanceEvent, EventWorkItem } from "../types";
import { db } from "../data/db";
import { base, save } from "../data/repository";
import { trainingTools } from "./webmcp";

beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
afterAll(() => db.delete());

const work: EventWorkItem = {
  id: "work-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  title: "衣装を試着する",
  description: "動きやすさを確認する",
  priority: "high",
  startDate: "2026-09-10",
  dueDate: "2026-09-15",
  status: "not_started",
  changes: [],
};

async function eventFixture() {
  const event: DanceEvent = {
    ...base(),
    title: "秋の発表会",
    type: "performance",
    date: "2026-10-10",
    status: "active",
    goalIds: [],
    workItems: [work],
  };
  await save("events", event);
  return (await db.events.get(event.id))!;
}

const tool = (name: string) => {
  const found = trainingTools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing tool: ${name}`);
  return found;
};

describe("Chatのイベントスケジュール連携", () => {
  it("読み取り・上書き・追加を安全性注釈で区別する", () => {
    expect(tool("read_event_schedule").annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(tool("revise_event_schedule").annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    });
    expect(tool("add_event_schedule_items").annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it("イベントを探し、会話用に最新版と編集可否を読む", async () => {
    const event = await eventFixture();
    const list = (await tool("read_event_schedule").execute({})) as {
      events: { id: string; title: string }[];
    };
    expect(list.events).toContainEqual({
      id: event.id,
      title: event.title,
      date: event.date,
      status: event.status,
    });

    const schedule = (await tool("read_event_schedule").execute({
      eventId: event.id,
    })) as {
      eventUpdatedAt: string;
      workItems: { id: string; editable: boolean }[];
    };
    expect(schedule.eventUpdatedAt).toBe(event.updatedAt);
    expect(schedule.workItems[0]).toMatchObject({
      id: work.id,
      editable: true,
    });
  });

  it("Chatで合意した日付変更を履歴付きで反映する", async () => {
    const event = await eventFixture();
    const result = (await tool("revise_event_schedule").execute({
      eventId: event.id,
      expectedUpdatedAt: event.updatedAt,
      changes: [
        {
          kind: "work",
          id: work.id,
          startDate: "2026-09-17",
          dueDate: "2026-09-22",
          reason: "衣装の到着が遅れたため",
        },
      ],
    })) as { changed: { id: string }[]; eventUpdatedAt: string };
    const updated = (await db.events.get(event.id))!;
    expect(result.changed).toEqual([expect.objectContaining({ id: work.id })]);
    expect(result.eventUpdatedAt).toBe(updated.updatedAt);
    expect(updated.workItems?.[0].startDate).toBe("2026-09-17");
    expect(updated.workItems?.[0].changes[0].reason).toBe(
      "衣装の到着が遅れたため",
    );
  });

  it("Chatで合意した新しい項目を追加し、古い版からの更新を拒否する", async () => {
    const event = await eventFixture();
    const addition = {
      eventId: event.id,
      expectedUpdatedAt: event.updatedAt,
      milestones: [],
      workItems: [
        {
          title: "本番用アクセサリーを確認する",
          description: "衣装と合わせて写真を撮る",
          startDate: "2026-09-23",
          dueDate: "2026-09-25",
          priority: "medium",
        },
      ],
    };
    const result = (await tool("add_event_schedule_items").execute(
      addition,
    )) as { addedWorkItems: EventWorkItem[] };
    expect(result.addedWorkItems[0].title).toBe("本番用アクセサリーを確認する");
    await expect(
      tool("add_event_schedule_items").execute(addition),
    ).rejects.toThrow("別の画面");
  });
});
