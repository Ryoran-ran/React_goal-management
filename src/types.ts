export type Priority = "high" | "medium" | "low";
export interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export type EventType =
  "competition" | "medal_test" | "performance" | "demo" | "other";
export interface DanceEvent extends Base {
  title: string;
  type: EventType;
  date: string;
  description?: string;
  status: "planned" | "active" | "completed" | "cancelled";
  goalIds: string[];
  milestones?: EventMilestone[];
  workItems?: EventWorkItem[];
}
export interface MilestonePlan {
  startDate?: string;
  dueDate?: string;
}
export interface MilestoneTask {
  id: string;
  title: string;
  completed: boolean;
}
export interface EventWorkItem extends Base, MilestonePlan {
  milestoneId?: string;
  title: string;
  description: string;
  priority: Priority;
  status: "not_started" | "in_progress" | "completed";
  actualStartDate?: string;
  completedDate?: string;
  baseline?: MilestonePlan;
  changes: EventMilestone["changes"];
}
export interface EventMilestone extends Base, MilestonePlan {
  title: string;
  successCriteria: string;
  status: "not_started" | "in_progress" | "achieved" | "skipped";
  actualStartDate?: string;
  completedDate?: string;
  baseline?: MilestonePlan;
  /** Legacy checklist, converted to event.workItems on startup/import. */
  tasks?: MilestoneTask[];
  changes: {
    changedAt: string;
    from: MilestonePlan;
    to: MilestonePlan;
    reason: string;
  }[];
}
export type GoalStatus = "not_started" | "in_progress" | "achieved" | "paused";
export type GoalCategory =
  | "general"
  | "latin"
  | "standard"
  | "cha_cha"
  | "samba"
  | "rumba"
  | "paso_doble"
  | "jive"
  | "waltz"
  | "tango"
  | "viennese_waltz"
  | "slow_foxtrot"
  | "quickstep";
export interface Goal extends Base {
  title: string;
  category?: GoalCategory;
  description?: string;
  status: GoalStatus;
  priority: Priority;
  progress: number;
  eventIds: string[];
  parentGoalId?: string;
  targetDate?: string;
  successCriteria?: string;
}
export interface MonthlyObjective {
  id: string;
  title: string;
  goalId?: string;
  successCriteria?: string;
  progress: number;
  completed: boolean;
}
export interface MonthlyPlan extends Base {
  year: number;
  month: number;
  focusGoalIds: string[];
  focusDetails?: Record<string, string>;
  objectives: MonthlyObjective[];
  lessonTargetCount?: number;
  notes?: string;
}
export interface WeeklyTask {
  id: string;
  title: string;
  goalIds: string[];
  completed: boolean;
}
export interface WeeklyPlan extends Base {
  startDate: string;
  endDate: string;
  focusGoalIds: string[];
  focusDetails?: Record<string, string>;
  tasks: WeeklyTask[];
  review?: string;
}
export interface PracticeLog extends Base {
  themeIds?: string[];
  date: string;
  title?: string;
  status?: "planned" | "recorded" | "cancelled";
  plannedNote?: string;
  durationMinutes?: number;
  goalIds: string[];
  practiced: boolean;
  whatWentWell?: string;
  whatNeedsImprovement?: string;
  note?: string;
  attachmentIds: string[];
}
export interface LessonTopic {
  id: string;
  title: string;
  priority: Priority;
  goalId?: string;
  completed?: boolean;
}
export interface Lesson extends Base {
  themeIds?: string[];
  date: string;
  title?: string;
  durationMinutes?: number;
  relatedEventIds: string[];
  relatedGoalIds: string[];
  plannedTopics: LessonTopic[];
  actualTopics: LessonTopic[];
  sections?: LessonSection[];
  teacherFeedback?: string;
  homework?: string;
  newIssues?: string;
  attachmentIds: string[];
  completed: boolean;
  cancelled?: boolean;
  cancellationReason?: string;
  seriesId?: string;
  originalDate?: string;
  seriesDate?: string;
}
export interface LessonSection {
  id: string;
  category: GoalCategory | "custom";
  customCategory?: string;
  content: string;
  feedback: string;
  homework: string;
  youtubeUrls: string[];
}
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  relatedType: "lesson" | "practice" | "event" | "goal" | "learning";
  relatedId: string;
  sectionId?: string;
  createdAt: string;
}
export interface AttachmentFile {
  id: string;
  blob: Blob;
  thumbnailBlob?: Blob;
}
export interface Setting {
  id: string;
  value: unknown;
}
export interface LearningTheme extends Base {
  title: string;
  category: string;
  destination: string;
  nextStep: string;
  nextStepUpdatedAt?: string;
  status: "active" | "paused" | "completed";
  eventIds: string[];
  goalIds: string[];
}
export interface LearningNote extends Base {
  date: string;
  kind: "lesson" | "practice" | "reflection";
  themeId?: string;
  memo: string;
  nextStep: string;
  youtubeUrls: string[];
  attachmentIds: string[];
  source?: { kind: "lesson" | "practice"; id: string };
}
