import { describe, expect, it } from "vitest";
import type { DanceEvent } from "../types";
import { notionScheduleCsv, notionScheduleRows } from "./notionCsv";

const event: DanceEvent = {
  id: "event-1",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  title: "文化祭で発表会",
  type: "performance",
  date: "2026-11-20",
  status: "active",
  goalIds: [],
  milestones: [
    {
      id: "milestone-1",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      title: "曲を決める",
      successCriteria: "先生と候補を確認",
      dueDate: "2026-10-01",
      status: "achieved",
      completedDate: "2026-09-30",
      changes: [],
    },
  ],
  workItems: [
    {
      id: "work-1",
      milestoneId: "milestone-1",
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      title: "候補曲を集める",
      description: '候補を3曲集める,\n先生に"相談"する',
      priority: "high",
      status: "in_progress",
      startDate: "2026-09-22",
      dueDate: "2026-09-25",
      changes: [],
    },
  ],
};

describe("Notion用スケジュールCSV", () => {
  it("作業を行、マイルストーンをタグ用の値として出力する", () => {
    const rows = notionScheduleRows(event);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      名前: "候補曲を集める",
      マイルストーン: "01-曲を決める",
      優先度: "高",
      開始日: "09/22/2026",
      終了日: "09/25/2026",
      メモ: "",
      "Dance Note ID": "work:work-1",
    });
  });

  it("カンマ・改行・引用符をCSVとしてエスケープする", () => {
    const csv = notionScheduleCsv(event);

    expect(csv.split("\r\n")[0]).toContain(
      '"名前","イベント","マイルストーン"',
    );
    expect(csv).not.toContain('"種類"');
    expect(csv).not.toContain('"期限"');
    expect(csv).not.toContain('"milestone:milestone-1"');
    expect(csv).toContain('"候補を3曲集める,\n先生に""相談""する"');
    expect(csv).toContain('"work:work-1"');
  });
});
