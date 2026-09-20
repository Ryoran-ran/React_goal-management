import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { DanceEvent, LearningTheme } from "../types";
import { saveTheme } from "../data/learning";
import { goalCategories } from "../lib/goalCategories";
import { Field, SaveForm } from "./ui";

export function ThemeEditor({
  value,
  events,
  onClose,
  onSaved,
}: {
  value: LearningTheme;
  events: DanceEvent[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [theme, setTheme] = useState(value);
  const patch = (change: Partial<LearningTheme>) =>
    setTheme((old) => ({ ...old, ...change }));
  return (
    <>
      <section className="card editor learning-editor">
        <button type="button" className="text-button" onClick={onClose}>
          <ArrowLeft size={18} />
          戻る
        </button>
        <h1>{value.title ? "テーマを編集" : "テーマを作成"}</h1>
        <SaveForm
          onSave={async () => {
            await saveTheme(theme);
            onSaved(theme.id);
          }}
          onCancel={onClose}
          saveLabel="テーマを保存"
        >
          <Field label="テーマ">
            <input
              autoFocus
              required
              maxLength={200}
              value={theme.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="例：ルンバの下半身の使い方"
            />
          </Field>
          <Field label="種目・カテゴリ（任意）">
            <input
              list="theme-categories"
              maxLength={80}
              value={theme.category}
              onChange={(e) => patch({ category: e.target.value })}
              placeholder="選ぶか、自由に入力"
            />
            <datalist id="theme-categories">
              {Object.values(goalCategories).map((name) => (
                <option value={name} key={name} />
              ))}
            </datalist>
          </Field>
          <Field label="できるようになりたいこと（任意）">
            <textarea
              value={theme.destination}
              onChange={(e) => patch({ destination: e.target.value })}
              placeholder="先生と話している目指す状態。まだ曖昧でも大丈夫です。"
            />
          </Field>
          <Field label="次に試すこと">
            <textarea
              value={theme.nextStep}
              onChange={(e) => patch({ nextStep: e.target.value })}
              placeholder="今わかっていることをひとつ。後から記録で更新できます。"
            />
          </Field>
          <details className="learning-optional">
            <summary>大会・状態を設定する</summary>
            <Field label="テーマの状態">
              <select
                value={theme.status}
                onChange={(e) =>
                  patch({ status: e.target.value as LearningTheme["status"] })
                }
              >
                <option value="active">今取り組む</option>
                <option value="paused">いったんお休み</option>
                <option value="completed">できるようになった</option>
              </select>
            </Field>
            <h3>目指す大会・イベント（任意）</h3>
            {events.length ? (
              events.map((event) => (
                <label className="check-field" key={event.id}>
                  <input
                    type="checkbox"
                    checked={theme.eventIds.includes(event.id)}
                    onChange={(e) =>
                      patch({
                        eventIds: e.target.checked
                          ? [...theme.eventIds, event.id]
                          : theme.eventIds.filter((id) => id !== event.id),
                      })
                    }
                  />
                  {event.date} · {event.title}
                </label>
              ))
            ) : (
              <p className="muted">大会は後から設定できます。</p>
            )}
          </details>
        </SaveForm>
      </section>
    </>
  );
}
