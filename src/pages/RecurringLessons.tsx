import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LessonSeriesManager } from "../components/LessonSeriesManager";
import { LessonScheduleEditor } from "../components/LessonScheduleEditor";

export function RecurringLessons({
  today,
  onBack,
}: {
  today: string;
  onBack: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const showList = () => {
    setAdding(false);
    window.scrollTo({ top: 0 });
  };
  return (
    <section className="learning-page">
      <button
        type="button"
        className="text-button agenda-back"
        onClick={adding ? showList : onBack}
      >
        <ArrowLeft size={18} />
        {adding ? "繰り返しレッスンに戻る" : "整理に戻る"}
      </button>
      <header className="learning-heading">
        <h1>繰り返しレッスン</h1>
      </header>
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {adding ? (
        <LessonScheduleEditor
          onClose={showList}
          onCreated={(count) => {
            setNotice(`${count}回のレッスン予定を登録しました。`);
            showList();
          }}
        />
      ) : (
        <LessonSeriesManager
          today={today}
          onAdd={() => {
            setNotice("");
            setAdding(true);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </section>
  );
}
