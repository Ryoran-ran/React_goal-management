import { describe, expect, it } from "vitest";
import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import {
  eventScheduleAdvicePrompt,
  eventScheduleRevisionJsonPrompt,
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

    expect(prompt).toContain("現実的に立て直せる組み直し案");
    expect(prompt).toContain('"overdue": 1');
    expect(prompt).toContain("平日は30分だけ使えます");
    expect(prompt).toContain("先生に衣装を確認する");
    expect(prompt).toContain('"id": "work-1"');
    expect(prompt).toContain("未確認事項を2〜5問に絞って質問");
    expect(prompt).toContain("この段階ではJSONを出さず");
    expect(prompt).toContain("別のJSON作成用プロンプト");
    expect(prompt).not.toContain("【合意後の変更用JSON】");
    expect(prompt).toContain("書かれていない進捗や完了実績を推測しない");

    const jsonPrompt = eventScheduleRevisionJsonPrompt(event);
    expect(jsonPrompt).toContain("合意した");
    expect(jsonPrompt).toContain("質問、説明、新しい提案");
    expect(jsonPrompt).toContain('"id": "work-1"');
    expect(jsonPrompt).toContain("【回答JSONの形式】");
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

  it("方針相談と自由相談では予定変更用JSONを求めない", () => {
    const direction = eventScheduleAdvicePrompt(
      event,
      "direction",
      undefined,
      "完成度と新しい振り付けのどちらを優先するか迷っています",
      "2026-09-27",
    );
    const free = eventScheduleAdvicePrompt(
      event,
      "free",
      undefined,
      "準備への不安を整理したいです",
      "2026-09-27",
    );
    expect(direction).toContain("予定変更用のJSONを出力せず");
    expect(direction).not.toContain("合意後の変更用JSON");
    expect(free).toContain("補足に書かれた相談へ直接");
    expect(free).not.toContain("合意後の変更用JSON");
  });
});
