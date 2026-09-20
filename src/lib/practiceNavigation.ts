import { base } from "../data/repository";
import { agendaStatus, type AgendaItem } from "../data/practiceAgenda";

export type PracticeEntry =
  | {
      type: "edit";
      item: AgendaItem;
      exists: boolean;
      recording: boolean;
      sectionId?: string;
    }
  | { type: "schedule" };
export type PracticeAction = "practice" | "lesson" | "schedule";

export function openAgendaItem(
  item: AgendaItem,
  today: string,
  sectionId?: string,
): PracticeEntry {
  return {
    type: "edit",
    item,
    exists: true,
    sectionId,
    recording: item.record.date <= today && agendaStatus(item) === "planned",
  };
}
export function newPracticeEntry(
  action: PracticeAction,
  today: string,
): PracticeEntry {
  if (action === "schedule") return { type: "schedule" };
  if (action === "practice")
    return {
      type: "edit",
      exists: false,
      recording: false,
      item: {
        kind: "practice",
        record: {
          ...base(),
          date: today,
          title: "",
          status: "planned",
          practiced: false,
          goalIds: [],
          attachmentIds: [],
        },
      },
    };
  return {
    type: "edit",
    exists: false,
    recording: false,
    item: {
      kind: "lesson",
      record: {
        ...base(),
        date: today,
        title: "",
        relatedEventIds: [],
        relatedGoalIds: [],
        plannedTopics: [],
        actualTopics: [],
        completed: false,
        attachmentIds: [],
      },
    },
  };
}
