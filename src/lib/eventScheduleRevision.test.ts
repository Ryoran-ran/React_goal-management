import { describe, expect, it } from "vitest";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import {
  parseEventScheduleRevision,
  previewEventScheduleRevision,
} from "./eventScheduleRevision";

const milestone: EventMilestone = {
  id: "milestone-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  title: "衣装を決める",
  successCriteria: "衣装が一式そろっている",
  dueDate: "2026-09-20",
  status: "in_progress",
  changes: [],
};

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

const event: DanceEvent = {
  id: "event-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  title: "秋の発表会",
  type: "performance",
  date: "2026-10-10",
  status: "active",
  goalIds: [],
  milestones: [milestone],
  workItems: [work],
};

const answer = (changes: unknown[]) =>
  `変更案です。\n\n\`\`\`json\n${JSON.stringify({ eventTitle: event.title, changes })}\n\`\`\``;

describe("イベント予定のAI変更案", () => {
  it("説明文に続くJSONを読み、変更前後をプレビューする", () => {
    const draft = parseEventScheduleRevision(
      answer([
        {
          kind: "work",
          id: work.id,
          startDate: "2026-09-17",
          dueDate: "2026-09-22",
          reason: "衣装の到着が遅れたため",
        },
      ]),
      event,
    );
    expect(previewEventScheduleRevision(event, draft)).toMatchObject({
      changes: [
        {
          title: "衣装を試着する",
          from: { startDate: "2026-09-10", dueDate: "2026-09-15" },
          to: { startDate: "2026-09-17", dueDate: "2026-09-22" },
          reason: "衣装の到着が遅れたため",
        },
      ],
      skippedUnchanged: 0,
    });
  });

  it("日付を外すnullを受け付け、変わらない項目を除く", () => {
    const draft = parseEventScheduleRevision(
      answer([
        {
          kind: "milestone",
          id: milestone.id,
          startDate: null,
          dueDate: null,
          reason: "期限を改めて相談するため",
        },
        {
          kind: "work",
          id: work.id,
          startDate: work.startDate,
          dueDate: work.dueDate,
          reason: "変更なし",
        },
      ]),
      event,
    );
    const preview = previewEventScheduleRevision(event, draft);
    expect(preview.changes[0].to).toEqual({});
    expect(preview.skippedUnchanged).toBe(1);
  });

  it("未知のID、不正な期間、開催日後、完了済みの変更を拒否する", () => {
    const change = {
      kind: "work",
      id: "missing",
      startDate: "2026-09-10",
      dueDate: "2026-09-15",
      reason: "変更",
    };
    expect(() => parseEventScheduleRevision(answer([change]), event)).toThrow(
      "見つかりません",
    );
    expect(() =>
      parseEventScheduleRevision(
        answer([{ ...change, id: work.id, startDate: "2026-09-20" }]),
        event,
      ),
    ).toThrow("開始日は終了日以前");
    expect(() =>
      parseEventScheduleRevision(
        answer([
          {
            ...change,
            id: work.id,
            startDate: "2026-10-11",
            dueDate: "2026-10-11",
          },
        ]),
        event,
      ),
    ).toThrow("開催日以前");
    expect(() =>
      parseEventScheduleRevision(answer([{ ...change, id: work.id }]), {
        ...event,
        workItems: [
          { ...work, status: "completed", completedDate: "2026-09-15" },
        ],
      }),
    ).toThrow("完了・見送り済み");
  });
});
