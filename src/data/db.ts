import Dexie, { type Table } from "dexie";
import type {
  DanceEvent,
  Goal,
  MonthlyPlan,
  WeeklyPlan,
  PracticeLog,
  Lesson,
  Attachment,
  AttachmentFile,
  Setting,
  LearningTheme,
  LearningNote,
} from "../types";
export class DanceDatabase extends Dexie {
  events!: Table<DanceEvent>;
  goals!: Table<Goal>;
  monthlyPlans!: Table<MonthlyPlan>;
  weeklyPlans!: Table<WeeklyPlan>;
  practiceLogs!: Table<PracticeLog>;
  lessons!: Table<Lesson>;
  attachments!: Table<Attachment>;
  attachmentFiles!: Table<AttachmentFile>;
  settings!: Table<Setting>;
  themes!: Table<LearningTheme>;
  learningNotes!: Table<LearningNote>;
  constructor(name = "dance-training") {
    super(name);
    this.version(1).stores({
      events: "id, date, *goalIds",
      goals: "id, status, *eventIds",
      monthlyPlans: "id, &[year+month]",
      weeklyPlans: "id, &startDate",
      practiceLogs: "id, &date",
      lessons: "id, date, *relatedGoalIds",
      attachments: "id, [relatedType+relatedId]",
      attachmentFiles: "id",
      settings: "id",
    });
    this.version(2).stores({
      lessons: "id, date, originalDate, seriesId, *relatedGoalIds",
    });
    this.version(3).stores({
      themes: "id, status, *eventIds, *goalIds",
      learningNotes: "id, date, themeId, [source.kind+source.id]",
    });
  }
}
export const db = new DanceDatabase();
