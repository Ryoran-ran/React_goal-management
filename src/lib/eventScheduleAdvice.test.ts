import { describe, expect, it } from "vitest";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import {
  eventScheduleAdvicePrompt,
  type EventAdviceTarget,
} from "./eventScheduleAdvice";

const milestone: EventMilestone = {
  id: "milestone-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  title: "衣装を決める",
  successCriteria: "本番用の衣装が一式そろっている",
  dueDate: "2026-09-20",
  status: "in_progress",
  changes: [],
};

const work: EventWorkItem = {
  id: "work-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  milestoneId: milestone.id,
  title: "先生に衣装を確認する",
  description: "候補の写真を見せる",
  priority: "high",
  dueDate: "2026-09-15",
  status: "in_progress",
  changes: [],
};

const event: DanceEvent = {
  id: "event-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  title: "秋の発表会",
  type: "performance",
  date: "2026-10-10",
  location: "市民ホール",
  status: "active",
  goalIds: [],
  milestones: [milestone],
  workItems: [work],
};

describe("イベント準備の相談用プロンプト", () => {
  it("遅延状況と登録済みの準備情報を含める", () => {
    const prompt = eventScheduleAdvicePrompt(
      event,
      "recovery",
      undefined,
      "平日は30分だけ使えます",
      "2026-09-27",
    );

    expect(prompt).toContain("現実的に立て直せる案");
    expect(prompt).toContain('"overdue": 1');
    expect(prompt).toContain("平日は30分だけ使えます");
    expect(prompt).toContain("先生に衣装を確認する");
    expect(prompt).toContain("書かれていない進捗や完了実績を推測しない");
  });

  it("選んだ作業の完了判定基準を求める", () => {
    const target: EventAdviceTarget = { kind: "work", item: work };
    const prompt = eventScheduleAdvicePrompt(
      event,
      "completion",
      target,
      "先生から候補で問題ないと言われました",
      "2026-09-27",
    );

    expect(prompt).toContain("完了にしてよい");
    expect(prompt).toContain('"kind": "作業"');
    expect(prompt).toContain("候補の写真を見せる");
    expect(prompt).toContain("確認事項を具体的なチェックリスト");
  });
});
