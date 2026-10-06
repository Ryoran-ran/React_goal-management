import { describe, expect, it } from "vitest";
import type { DanceEvent } from "../types";
import {
  aiEventScheduleConsultationPrompt,
  aiEventScheduleJsonPrompt,
  parseAiEventSchedule,
  previewScheduleImport,
} from "./aiEventSchedule";

const event: DanceEvent = {
  id: "event-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  title: "メダルテスト",
  type: "medal_test",
  date: "2026-10-25",
  location: "中央市民ホール",
  description: "ラテン2種目",
  status: "planned",
  goalIds: [],
  practiceSessions: [
    {
      id: "practice-1",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      date: "2026-10-10",
      kind: "lesson",
      title: "個人レッスン",
      status: "planned",
      memo: "",
    },
    {
      id: "practice-2",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      date: "2026-10-18",
      kind: "practice",
      title: "体育館",
      status: "planned",
      memo: "",
    },
  ],
};

const response = {
  eventTitle: "メダルテスト",
  milestones: [
    {
      key: "entry",
      title: "申込完了",
      dueDate: "2026-10-01",
      successCriteria: "申込と支払いを終える",
      workItems: [
        {
          title: "申込書を提出",
          description: "先生に確認して提出する",
          startDate: "2026-09-25",
          dueDate: "2026-09-30",
          priority: "high",
        },
      ],
    },
  ],
  workItems: [],
};

describe("AI event schedule", () => {
  it("builds a prompt containing the event and import schema", () => {
    const prompt = aiEventScheduleConsultationPrompt(
      event,
      "週末を中心にする",
      "2026-10-01",
      [
        {
          date: "2026-09-28",
          lesson: "個人レッスン",
          category: "ルンバ",
          notes: [
            {
              label: "先生からの指摘・アドバイス",
              content: "送り足を最後まで使う",
            },
            { label: "次回までの宿題", content: "音楽で3回通す" },
          ],
        },
      ],
    );
    expect(prompt).toContain("メダルテスト");
    expect(prompt).toContain("2026-10-25");
    expect(prompt).toContain("中央市民ホール");
    expect(prompt).toContain("週末を中心にする");
    expect(prompt).toContain("最初の回答では、スケジュール案やJSONを出さない");
    expect(prompt).toContain("未確認事項を2〜5問に絞って質問");
    expect(prompt).toContain("別のJSON作成用プロンプトを送ります");
    expect(prompt).not.toContain("【回答JSONの形式】");
    expect(prompt).toContain('"milestones"');
    expect(prompt).toContain("【練習回数】");
    expect(prompt).toContain('"scheduledRemaining": 2');
    expect(prompt).toContain('"lesson": 1');
    expect(prompt).toContain('"selfPractice": 1');
    expect(prompt).toContain("【関連するレッスン記録】");
    expect(prompt).toContain("送り足を最後まで使う");
    expect(prompt).toContain("音楽で3回通す");

    const jsonPrompt = aiEventScheduleJsonPrompt(event);
    expect(jsonPrompt).toContain("合意した");
    expect(jsonPrompt).toContain("質問、説明、新しい提案");
    expect(jsonPrompt).toContain("【回答JSONの形式】");
    expect(jsonPrompt).toContain('"changes"');
    expect(jsonPrompt).toContain("```json と ``` で囲んでください");
  });

  it("parses JSON code fences and validates the target event", () => {
    expect(
      parseAiEventSchedule(
        `\`\`\`json\n${JSON.stringify(response)}\n\`\`\``,
        event,
      ).milestones[0].title,
    ).toBe("申込完了");
    expect(() =>
      parseAiEventSchedule(
        JSON.stringify({ ...response, eventTitle: "別の大会" }),
        event,
      ),
    ).toThrow("イベント名が一致しません");
  });

  it("rejects schedules after the event date", () => {
    const invalid = structuredClone(response);
    invalid.milestones[0].dueDate = "2026-10-26";
    expect(() => parseAiEventSchedule(JSON.stringify(invalid), event)).toThrow(
      "イベント開催日以前",
    );
  });

  it("adds new items and skips duplicate milestone and work dates", () => {
    const draft = parseAiEventSchedule(JSON.stringify(response), event);
    const first = previewScheduleImport(
      event,
      draft,
      "2026-09-23T00:00:00.000Z",
      (() => {
        let id = 0;
        return () => `new-${++id}`;
      })(),
    );
    expect(first.milestones).toHaveLength(1);
    expect(first.workItems).toHaveLength(1);
    expect(first.workItems[0].milestoneId).toBe(first.milestones[0].id);

    const second = previewScheduleImport(
      {
        ...event,
        milestones: first.milestones,
        workItems: first.workItems,
      },
      draft,
    );
    expect(second.milestones).toHaveLength(0);
    expect(second.workItems).toHaveLength(0);
    expect(second.skippedMilestones).toBe(1);
    expect(second.skippedWorkItems).toBe(1);
  });
});
