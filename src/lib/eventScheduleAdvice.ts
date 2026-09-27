import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { daysUntil, localDate } from "./dates";

export type EventAdvicePurpose = "recovery" | "completion" | "next";

export type EventAdviceTarget =
  | { kind: "milestone"; item: EventMilestone }
  | { kind: "work"; item: EventWorkItem };

const eventStatusLabels: Record<DanceEvent["status"], string> = {
  planned: "予定",
  active: "準備中",
  completed: "完了",
  cancelled: "中止",
};

const milestoneStatusLabels: Record<EventMilestone["status"], string> = {
  not_started: "未着手",
  in_progress: "取り組み中",
  achieved: "達成",
  skipped: "見送り",
};

const workStatusLabels: Record<EventWorkItem["status"], string> = {
  not_started: "未着手",
  in_progress: "取り組み中",
  completed: "完了",
};

const priorityLabels: Record<EventWorkItem["priority"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const purposeInstructions: Record<EventAdvicePurpose, string[]> = {
  recovery: [
    "期限超過・進行中・未着手の順に状況を確認し、イベント日までに現実的に立て直せる案を作ってください。",
    "やることを増やしすぎず、延期・縮小・省略できるものも示してください。",
    "今日から着手する最初の一歩と、その後の優先作業を最大3件まで示してください。",
  ],
  completion: [
    "選んだ対象を完了としてよいか、登録済みの達成条件・作業内容・現在の状態だけを根拠に判定してください。",
    "『完了にしてよい』『確認が必要』『まだ完了ではない』のいずれかを最初に示してください。",
    "判断材料が不足している場合は、完了に必要な確認事項を具体的なチェックリストにしてください。",
  ],
  next: [
    "全体の期限・進捗・優先度から、今もっとも重要な作業を一つ選んでください。",
    "その理由と、終わったと判断できる状態を示してください。必要なら次点を最大2件まで示してください。",
  ],
};

const targetPayload = (target: EventAdviceTarget | undefined) => {
  if (!target) return null;
  if (target.kind === "milestone") {
    return {
      kind: "マイルストーン",
      title: target.item.title,
      status: milestoneStatusLabels[target.item.status],
      dueDate: target.item.dueDate ?? null,
      successCriteria: target.item.successCriteria || null,
    };
  }
  return {
    kind: "作業",
    title: target.item.title,
    status: workStatusLabels[target.item.status],
    startDate: target.item.startDate ?? null,
    dueDate: target.item.dueDate ?? null,
    description: target.item.description || null,
  };
};

export function eventScheduleAdvicePrompt(
  event: DanceEvent,
  purpose: EventAdvicePurpose,
  target?: EventAdviceTarget,
  note = "",
  today = localDate(),
) {
  const milestones = event.milestones ?? [];
  const workItems = event.workItems ?? [];
  const milestoneTitles = new Map(
    milestones.map((item) => [item.id, item.title]),
  );
  const unfinishedWork = workItems.filter(
    (item) => item.status !== "completed",
  );
  const overdueWork = unfinishedWork.filter(
    (item) => item.dueDate && item.dueDate < today,
  );

  return [
    "あなたは、イベント準備を現実的に前へ進める相談相手です。",
    "以下の登録情報を事実として扱い、書かれていない進捗や完了実績を推測しないでください。",
    "情報が足りない場合は、判断に必要な質問を最大3つまで先に示してください。",
    "回答は日本語で、最初に結論、その後に理由と具体的な次の行動を簡潔に示してください。",
    "",
    "【今回の相談】",
    ...purposeInstructions[purpose].map((instruction) => `- ${instruction}`),
    ...(purpose === "completion" && !target
      ? ["- 完了を相談する対象が未選択です。対象の確認を求めてください。"]
      : []),
    ...(note.trim() ? [`- 補足: ${note.trim()}`] : []),
    "",
    "【基準日とイベント】",
    JSON.stringify(
      {
        today,
        event: {
          title: event.title,
          date: event.date,
          daysUntilEvent: daysUntil(event.date, today),
          location: event.location?.trim() || null,
          description: event.description?.trim() || null,
          status: eventStatusLabels[event.status],
        },
        progress: {
          milestones: {
            achieved: milestones.filter((item) => item.status === "achieved")
              .length,
            active: milestones.filter((item) => item.status !== "skipped")
              .length,
          },
          workItems: {
            completed: workItems.filter((item) => item.status === "completed")
              .length,
            total: workItems.length,
            overdue: overdueWork.length,
          },
        },
      },
      null,
      2,
    ),
    "",
    "【完了を相談する対象】",
    JSON.stringify(targetPayload(target), null, 2),
    "",
    "【マイルストーン】",
    JSON.stringify(
      milestones.map((item) => ({
        title: item.title,
        status: milestoneStatusLabels[item.status],
        startDate: item.startDate ?? null,
        dueDate: item.dueDate ?? null,
        actualStartDate: item.actualStartDate ?? null,
        completedDate: item.completedDate ?? null,
        originalPlan: item.baseline ?? null,
        planChanges: item.changes.map((change) => ({
          changedAt: change.changedAt,
          from: change.from,
          to: change.to,
          reason: change.reason || null,
        })),
        successCriteria: item.successCriteria || null,
      })),
      null,
      2,
    ),
    "",
    "【作業】",
    JSON.stringify(
      workItems.map((item) => ({
        milestone: item.milestoneId
          ? (milestoneTitles.get(item.milestoneId) ?? "未分類")
          : "未分類",
        title: item.title,
        description: item.description || null,
        priority: priorityLabels[item.priority],
        status: workStatusLabels[item.status],
        startDate: item.startDate ?? null,
        dueDate: item.dueDate ?? null,
        actualStartDate: item.actualStartDate ?? null,
        completedDate: item.completedDate ?? null,
        originalPlan: item.baseline ?? null,
        planChanges: item.changes.map((change) => ({
          changedAt: change.changedAt,
          from: change.from,
          to: change.to,
          reason: change.reason || null,
        })),
        overdue:
          item.status !== "completed" && !!item.dueDate && item.dueDate < today,
      })),
      null,
      2,
    ),
  ].join("\n");
}
