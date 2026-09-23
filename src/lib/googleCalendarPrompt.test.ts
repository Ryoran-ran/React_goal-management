import { describe, expect, it } from "vitest";
import type { DanceEvent } from "../types";
import {
  googleCalendarItems,
  googleCalendarPrompt,
} from "./googleCalendarPrompt";

const event = (): DanceEvent => ({
  id: "event-1",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  title: "秋の競技会",
  type: "competition",
  date: "2026-11-03",
  description: "市民ホール",
  status: "active",
  goalIds: [],
  milestones: [
    {
      id: "entry",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      title: "申込完了",
      successCriteria: "申込メールを確認",
      dueDate: "2026-10-01",
      status: "in_progress",
      changes: [],
    },
    {
      id: "costume",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      title: "衣装決定",
      successCriteria: "",
      status: "not_started",
      changes: [],
    },
    {
      id: "done",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      title: "達成済み",
      successCriteria: "",
      dueDate: "2026-09-20",
      status: "achieved",
      completedDate: "2026-09-19",
      changes: [],
    },
  ],
  workItems: [
    {
      id: "practice",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      title: "本番用の通し練習",
      description: "衣装を着て確認",
      milestoneId: "entry",
      startDate: "2026-10-20",
      dueDate: "2026-10-25",
      priority: "high",
      status: "not_started",
      changes: [],
    },
    {
      id: "complete",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      title: "完了した作業",
      description: "",
      startDate: "2026-09-10",
      dueDate: "2026-09-10",
      priority: "low",
      status: "completed",
      completedDate: "2026-09-10",
      changes: [],
    },
  ],
});

describe("Googleカレンダー登録用プロンプト", () => {
  it("開催日・未完了の期限・作業期間を日付順にまとめる", () => {
    const result = googleCalendarItems(event());
    expect(result.items.map((item) => item.id)).toEqual([
      "milestone:entry",
      "work:practice",
      "event:event-1",
    ]);
    expect(result.items[1]).toMatchObject({
      startDate: "2026-10-20",
      endDate: "2026-10-25",
    });
    expect(result.items[1].description).toContain("関連する到達点: 申込完了");
    expect(result.omittedUndatedCount).toBe(1);
  });

  it("指定した場合は完了済みの項目も含める", () => {
    const result = googleCalendarItems(event(), true);
    expect(result.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["milestone:done", "work:complete"]),
    );
  });

  it("重複確認・登録前確認・追加の希望とJSONを含む", () => {
    const prompt = googleCalendarPrompt(
      event(),
      false,
      "大会には前日に通知してください",
      "社交ダンス",
    );
    expect(prompt).toContain("私の確認を求めてください");
    expect(prompt).toContain("同じ Dance Note ID");
    expect(prompt).toContain("大会には前日に通知してください");
    expect(prompt).toContain("登録先は「社交ダンス」");
    expect(prompt).toContain('"targetCalendarName": "社交ダンス"');
    expect(prompt).toContain("作成してよいか確認してください");
    expect(prompt).toContain('"title": "[秋の競技会] 開催日"');
    expect(prompt).toContain('"title": "[秋の競技会] 申込完了"');
    expect(prompt).toContain('"title": "[秋の競技会] 本番用の通し練習"');
    expect(prompt).not.toContain("完了した作業");
    expect(googleCalendarPrompt(undefined)).toBe("");
  });
});
