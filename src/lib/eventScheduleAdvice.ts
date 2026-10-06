import type { DanceEvent, EventMilestone, EventWorkItem } from "../types";
import { daysUntil, localDate } from "./dates";
import type { EventLessonPromptRecord } from "./eventLessonPrompt";
import { eventPracticePromptSummary } from "./eventPractice";

export type EventAdvicePurpose =
  "recovery" | "direction" | "next" | "completion" | "free";

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
    "予定が大きく動いた前提で、期限超過・進行中・未着手の状況を確認し、イベント日までに現実的に立て直せる組み直し案を一緒に決めてください。",
    "最初の回答では変更案やJSONを確定せず、利用できる時間、動かせない期限、現在の進み具合、優先したい成果など、組み直しに大きく影響する未確認事項を2〜5問に絞って質問してください。登録情報や補足から分かることは聞き直さないでください。",
    "回答を受けたら、延期・縮小・省略の選択肢と影響を比較し、変更前後の日付と理由が分かる案を示してください。この段階ではJSONを出さず、修正点がないか確認してください。",
    "ユーザーが具体的な変更案を承認したら、そこで相談を終えてください。この相談用プロンプトへの回答ではJSONを出さず、別のJSON作成用プロンプトを待ってください。",
  ],
  direction: [
    "日付変更を決める前に、イベントに向けて何を優先し、何を諦めるかという方針を一緒に整理してください。",
    "選択肢がある場合は、それぞれの利点・負担・イベントへの影響を比較してください。",
    "この相談では予定変更用のJSONを出力せず、最後に合意できた方針と保留事項を短くまとめてください。",
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
  free: [
    "補足に書かれた相談へ直接答えてください。相談内容が曖昧な場合は、意図を決めつけず確認してください。",
    "必要に応じて登録済みの予定や進捗を根拠にしますが、求められていない計画変更は提案しすぎないでください。",
    "この相談では予定変更用のJSONを出力しないでください。",
  ],
};

const targetPayload = (target: EventAdviceTarget | undefined) => {
  if (!target) return null;
  if (target.kind === "milestone") {
    return {
      id: target.item.id,
      kind: "マイルストーン",
      title: target.item.title,
      status: milestoneStatusLabels[target.item.status],
      dueDate: target.item.dueDate ?? null,
      successCriteria: target.item.successCriteria || null,
    };
  }
  return {
    id: target.item.id,
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
  lessonRecords: EventLessonPromptRecord[] = [],
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
          practiceSessions: eventPracticePromptSummary(event, today),
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
        id: item.id,
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
        id: item.id,
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
    "",
    "【関連するレッスン記録】",
    JSON.stringify(lessonRecords, null, 2),
  ].join("\n");
}

export function eventScheduleRevisionJsonPrompt(event: DanceEvent) {
  return [
    `ここまでの会話で合意した「${event.title}」の予定変更を、反映用JSONへ変換してください。`,
    "この依頼では質問、説明、新しい提案、合意内容の変更を加えないでください。会話で合意した変更だけを出力してください。",
    "合意した確定案を特定できない場合はJSONを出さず、不明な点を一つだけ確認してください。",
    "",
    "【変換条件】",
    "- 変更する項目だけをchangesへ入れ、下の登録情報にあるidとkindをそのまま使ってください。",
    "- kindはマイルストーンならmilestone、作業ならworkです。",
    "- startDateとdueDateは合意した変更後の日付をYYYY-MM-DDで、日付を外す場合はnullで必ず両方指定してください。",
    "- reasonには会話で合意した変更理由を書いてください。状態・名前・内容・優先度は変更しません。",
    `- 完了・達成・見送り済みの項目、変更しない項目、${event.date}より後の日付は含めないでください。`,
    "- 変更が不要ならchangesを空配列にしてください。回答は有効なJSONコードブロック一つだけにしてください。",
    "",
    "【現在の登録項目】",
    JSON.stringify(
      {
        milestones: (event.milestones ?? []).map((item) => ({
          kind: "milestone",
          id: item.id,
          title: item.title,
          status: milestoneStatusLabels[item.status],
          startDate: item.startDate ?? null,
          dueDate: item.dueDate ?? null,
        })),
        workItems: (event.workItems ?? []).map((item) => ({
          kind: "work",
          id: item.id,
          title: item.title,
          status: workStatusLabels[item.status],
          startDate: item.startDate ?? null,
          dueDate: item.dueDate ?? null,
        })),
      },
      null,
      2,
    ),
    "",
    "【回答JSONの形式】",
    "```json",
    JSON.stringify(
      {
        eventTitle: event.title,
        changes: [
          {
            kind: "work",
            id: "登録情報にあるID",
            startDate: "YYYY-MM-DD または null",
            dueDate: "YYYY-MM-DD または null",
            reason: "合意した変更理由",
          },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}
