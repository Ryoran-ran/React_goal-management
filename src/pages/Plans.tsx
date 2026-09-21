import { DatePicker } from "../components/DatePicker";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { MonthlyPlan, WeeklyPlan } from "../types";
import { base, monthly, remove, save, weekly } from "../data/repository";
import { useQuery } from "../lib/hooks";
import { addDays, dateLabel, localDate, weekOf } from "../lib/dates";
import { Field, PageHeading, SaveForm } from "../components/ui";
export function Plans() {
  const [tab, setTab] = useState<"week" | "month">("week");
  const [date, setDate] = useState(localDate());
  const [month, setMonth] = useState(localDate().slice(0, 7));
  return (
    <>
      <div className="plans-page with-floating-add">
        <PageHeading
          eyebrow="YOUR PLAN"
          title="週・月の計画"
          description="今週・今月に取り組むことを決めます。"
        />
        <div className="toolbar plan-toolbar">
          <div className="plan-date-control">
            <label htmlFor="plan-period">
              {tab === "week" ? "計画する週の日付" : "計画する月"}
            </label>
            {tab === "week" ? (
              <div className="period">
                <button
                  className="icon-button"
                  aria-label="前の週"
                  onClick={() => setDate(addDays(date, -7))}
                >
                  ←
                </button>
                <DatePicker
                  id="plan-period"
                  aria-label="計画する週の日付"
                  type="date"
                  value={date}
                  onChange={(nextDateValue) =>
                    nextDateValue && setDate(nextDateValue)
                  }
                />
                <button
                  className="icon-button"
                  aria-label="次の週"
                  onClick={() => setDate(addDays(date, 7))}
                >
                  →
                </button>
              </div>
            ) : (
              <DatePicker
                id="plan-period"
                aria-label="計画する月"
                type="month"
                value={month}
                onChange={(nextDateValue) =>
                  nextDateValue && setMonth(nextDateValue)
                }
              />
            )}
          </div>
          <div className="plan-mode-control">
            <span>計画の種類</span>
            <div className="segmented" role="group" aria-label="計画の種類">
              <button
                className={tab === "week" ? "active" : ""}
                aria-pressed={tab === "week"}
                onClick={() => setTab("week")}
              >
                週次計画
              </button>
              <button
                className={tab === "month" ? "active" : ""}
                aria-pressed={tab === "month"}
                onClick={() => setTab("month")}
              >
                月次計画
              </button>
            </div>
          </div>
        </div>
        {tab === "week" ? (
          <WeekLoader key={weekOf(date).startDate} date={date} />
        ) : (
          <MonthLoader key={month} month={month} />
        )}
      </div>
    </>
  );
}
function WeekLoader({ date }: { date: string }) {
  const result = useQuery(() => weekly(date), [date]);
  if (result.error)
    return (
      <p role="alert" className="error">
        {result.error}
      </p>
    );
  if (!("data" in result)) return <p>読み込み中…</p>;
  return (
    <WeekEditor
      value={
        result.data ?? {
          ...base(),
          ...weekOf(date),
          focusGoalIds: [],
          tasks: [],
        }
      }
      exists={!!result.data}
    />
  );
}
function WeekEditor({ value, exists }: { value: WeeklyPlan; exists: boolean }) {
  const [plan, setPlan] = useState(value);
  const [deleted, setDeleted] = useState(false);
  if (deleted) return <WeekLoader key={plan.id} date={plan.startDate} />;
  return (
    <section className="card plan-editor">
      <header className="section-heading">
        <h2>
          {dateLabel(plan.startDate)} — {dateLabel(plan.endDate)}
        </h2>
        <span className="tag">今週の計画</span>
      </header>
      <SaveForm
        onSave={async () => {
          await save("weeklyPlans", plan);
        }}
        onDelete={
          exists
            ? async () => {
                await remove("weeklyPlans", plan.id);
                setDeleted(true);
              }
            : undefined
        }
      >
        <div className="section-heading">
          <h3>今週取り組むこと</h3>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setPlan({
                ...plan,
                tasks: [
                  ...plan.tasks,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    goalIds: [],
                    completed: false,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            項目を追加
          </button>
        </div>
        {plan.tasks.length === 0 && (
          <p className="muted">練習内容を小さな項目に分けて追加しましょう。</p>
        )}
        {plan.tasks.map((task, index) => (
          <div key={task.id} className="subform">
            <div className="task-edit">
              <input
                type="checkbox"
                aria-label={`${task.title || "項目"}を完了`}
                checked={task.completed}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    tasks: plan.tasks.map((t) =>
                      t.id === task.id
                        ? { ...t, completed: e.target.checked }
                        : t,
                    ),
                  })
                }
              />
              <input
                aria-label={`練習項目 ${index + 1}`}
                required
                value={task.title}
                placeholder="例：ルンバウォークを10分"
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    tasks: plan.tasks.map((t) =>
                      t.id === task.id ? { ...t, title: e.target.value } : t,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label="項目を削除"
                onClick={() =>
                  setPlan({
                    ...plan,
                    tasks: plan.tasks.filter((t) => t.id !== task.id),
                  })
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}
        <Field label="今週の振り返り・翌週へのメモ">
          <textarea
            value={plan.review ?? ""}
            onChange={(e) => setPlan({ ...plan, review: e.target.value })}
            placeholder="できたこと、来週も続けたいこと"
          />
        </Field>
      </SaveForm>
    </section>
  );
}
function MonthLoader({ month }: { month: string }) {
  const result = useQuery(() => monthly(month), [month]);
  if (result.error)
    return (
      <p role="alert" className="error">
        {result.error}
      </p>
    );
  if (!("data" in result)) return <p>読み込み中…</p>;
  const [year, m] = month.split("-").map(Number);
  return (
    <MonthEditor
      value={
        result.data ?? {
          ...base(),
          year,
          month: m,
          focusGoalIds: [],
          objectives: [],
        }
      }
      exists={!!result.data}
    />
  );
}
function MonthEditor({
  value,
  exists,
}: {
  value: MonthlyPlan;
  exists: boolean;
}) {
  const [plan, setPlan] = useState(value);
  const [deleted, setDeleted] = useState(false);
  if (deleted)
    return (
      <MonthLoader
        month={`${plan.year}-${String(plan.month).padStart(2, "0")}`}
      />
    );
  return (
    <section className="card plan-editor">
      <header className="section-heading">
        <h2>
          {plan.year}年 {plan.month}月の計画
        </h2>
        <span className="tag">月の方向づけ</span>
      </header>
      <SaveForm
        onSave={async () => {
          await save("monthlyPlans", plan);
        }}
        onDelete={
          exists
            ? async () => {
                await remove("monthlyPlans", plan.id);
                setDeleted(true);
              }
            : undefined
        }
      >
        <div className="section-heading">
          <h3>今月の到達点</h3>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setPlan({
                ...plan,
                objectives: [
                  ...plan.objectives,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    progress: 0,
                    completed: false,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            項目を追加
          </button>
        </div>
        {plan.objectives.map((objective, index) => {
          const update = (patch: Partial<typeof objective>) =>
            setPlan({
              ...plan,
              objectives: plan.objectives.map((o) =>
                o.id === objective.id ? { ...o, ...patch } : o,
              ),
            });
          return (
            <div className="subform" key={objective.id}>
              <div className="task-edit">
                <input
                  type="checkbox"
                  aria-label={`${objective.title || "到達点"}を達成`}
                  checked={objective.completed}
                  onChange={(e) =>
                    update({
                      completed: e.target.checked,
                      progress: e.target.checked ? 100 : 0,
                    })
                  }
                />
                <input
                  required
                  aria-label={`月の到達点 ${index + 1}`}
                  value={objective.title}
                  placeholder="例：軸を保って踊る"
                  onChange={(e) => update({ title: e.target.value })}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="到達点を削除"
                  onClick={() =>
                    setPlan({
                      ...plan,
                      objectives: plan.objectives.filter(
                        (o) => o.id !== objective.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
              <div className="form-grid">
                <Field label={`進捗 ${objective.progress}%`}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={objective.progress}
                    onChange={(e) =>
                      update({
                        progress: Number(e.target.value),
                        completed: Number(e.target.value) === 100,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="達成条件">
                <input
                  value={objective.successCriteria ?? ""}
                  onChange={(e) => update({ successCriteria: e.target.value })}
                />
              </Field>
            </div>
          );
        })}
        <Field label="レッスン目標回数">
          <input
            type="number"
            min="0"
            max="100"
            value={plan.lessonTargetCount ?? ""}
            onChange={(e) =>
              setPlan({
                ...plan,
                lessonTargetCount:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="月のメモ">
          <textarea
            value={plan.notes ?? ""}
            onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
          />
        </Field>
      </SaveForm>
    </section>
  );
}
