import Dexie, { type Table } from "dexie";
import { installJournal } from "../sync/journal";
import type {
  DeviceState,
  MediaRecord,
  Outbox,
  Revision,
  StoredEvent,
  SyncConflict,
} from "../sync/model";
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
  syncEvents!: Table<StoredEvent, string>;
  syncRevisions!: Table<Revision, string>;
  syncConflicts!: Table<SyncConflict, string>;
  syncMeta!: Table<DeviceState, string>;
  syncMedia!: Table<MediaRecord, string>;
  syncOutbox!: Table<Outbox, string>;
  syncFiles!: Table<
    { id: string; sha256: string; modifiedTime?: string },
    string
  >;
  syncSnapshots!: Table<{ id: string; createdAt: string; blob: Blob }, string>;
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
    this.version(4).stores({
      syncEvents: "eventId, status, [recordType+recordId]",
      syncRevisions: "key",
      syncConflicts: "key",
      syncMeta: "key",
      syncMedia: "id",
      syncOutbox: "id, uploaded",
      syncFiles: "id",
      syncSnapshots: "id, createdAt",
    });
    installJournal(this);
  }
}
export const db = new DanceDatabase();
