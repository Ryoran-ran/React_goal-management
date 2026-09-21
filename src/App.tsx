import { useEffect, useState } from "react";
import {
  CalendarDays,
  NotebookPen,
  Settings2,
  CheckCircle2,
  DatabaseBackup,
  MessageSquare,
} from "lucide-react";
import { initialize } from "./data/repository";
import { CalendarSettings } from "./components/CalendarSettings";
import { localDate } from "./lib/dates";
import { Learning } from "./pages/Learning";
import { Events } from "./pages/Events";
import { Backup } from "./pages/Backup";
import { LessonAdvice } from "./pages/LessonAdvice";
import { Plans } from "./pages/Plans";
import { Practice } from "./pages/PracticeAgenda";
import { openAgendaItem, type PracticeEntry } from "./lib/practiceNavigation";
import { errorText } from "./lib/hooks";
import { registerTrainingTools } from "./lib/webmcp";
const navigation = [
  { id: "home", label: "今日", icon: CalendarDays },
  { id: "notes", label: "学びの記録", icon: NotebookPen },
  { id: "practice", label: "予定", icon: CalendarDays },
  { id: "events", label: "大会など", icon: CalendarDays },
  { id: "tools", label: "整理", icon: Settings2 },
] as const;
type Page = (typeof navigation)[number]["id"] | "plans" | "backup" | "advice";
export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [practiceEntry, setPracticeEntry] = useState<PracticeEntry>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [today, setToday] = useState(localDate());
  useEffect(() => {
    initialize()
      .then(() => setReady(true))
      .catch((e) => setError(errorText(e)));
    const timer = window.setInterval(() => setToday(localDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (ready) return registerTrainingTools();
  }, [ready]);
  const navigate = (value: Page) => {
    setPracticeEntry(undefined);
    setPage(value);
    window.scrollTo({ top: 0 });
  };
  const openPractice = (entry: PracticeEntry) => {
    setPracticeEntry(entry);
    setPage("practice");
    window.scrollTo({ top: 0 });
  };
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        本文へ移動
      </a>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-mark">dn</span>
          <div>Dance Note</div>
        </a>
        <span className="nav-caption">練習を続ける</span>
        <nav aria-label="メインナビゲーション">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`${page === item.id || (item.id === "tools" && (page === "plans" || page === "backup" || page === "advice")) ? "active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <CheckCircle2 size={16} />
          <span>
            この端末に保存<small>あなたの練習を、あなたの手元に。</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>MY PRACTICE NOTE</span>
          <span className="local-badge">
            <span />
            プライベートノート
          </span>
        </header>
        <main id="main" tabIndex={-1}>
          {error ? (
            <div className="card">
              <h1>ノートを開けませんでした</h1>
              <p role="alert" className="error">
                {error}
              </p>
              <button
                className="secondary"
                onClick={() => window.location.reload()}
              >
                再読み込み
              </button>
            </div>
          ) : !ready ? (
            <p role="status">ノートを準備しています…</p>
          ) : page === "home" || page === "notes" ? (
            <Learning
              today={today}
              mode={page === "home" ? "themes" : "notes"}
              onSchedule={() => navigate("practice")}
              onEvents={() => navigate("events")}
              onLegacy={(item, sectionId) =>
                openPractice(openAgendaItem(item, today, sectionId))
              }
            />
          ) : page === "advice" ? (
            <LessonAdvice today={today} onBack={() => navigate("tools")} />
          ) : page === "backup" ? (
            <Backup onBack={() => navigate("tools")} />
          ) : page === "events" ? (
            <Events />
          ) : page === "plans" ? (
            <>
              <button
                type="button"
                className="text-button"
                onClick={() => navigate("tools")}
              >
                ← 整理に戻る
              </button>
              <Plans />
            </>
          ) : page === "tools" ? (
            <section className="learning-page">
              <header className="learning-heading">
                <h1>整理</h1>
              </header>
              <div className="learning-tool-grid">
                <button
                  className="card learning-note-card"
                  onClick={() => navigate("advice")}
                >
                  <MessageSquare size={24} />
                  <h2>レッスンをAIに相談</h2>
                  <p>
                    期間と相談内容を指定し、記録入りのプロンプトをコピーします。
                  </p>
                </button>
                <button
                  className="card learning-note-card"
                  onClick={() => navigate("backup")}
                >
                  <DatabaseBackup size={24} />
                  <h2>エクスポート・インポート</h2>
                  <p>
                    画像・動画を含めてバックアップし、別の端末にも引き継げます。
                  </p>
                </button>

                <button
                  className="card learning-note-card"
                  onClick={() => navigate("plans")}
                >
                  <CalendarDays size={24} />
                  <h2>週・月の計画</h2>
                  <p>期間を決めて練習を組みたいときに。</p>
                </button>
                <button
                  className="card learning-note-card"
                  onClick={() => navigate("practice")}
                >
                  <NotebookPen size={24} />
                  <h2>以前のレッスン・練習記録</h2>
                  <p>これまでの記録・添付資料・繰り返し予定を開く。</p>
                </button>
                <CalendarSettings />
              </div>
            </section>
          ) : (
            <Practice
              key={
                practiceEntry?.type === "edit"
                  ? practiceEntry.item.record.id
                  : (practiceEntry?.type ?? "list")
              }
              today={today}
              entry={practiceEntry}
            />
          )}
        </main>
      </div>
    </div>
  );
}
