import { countdownParts } from "../lib/dates";

export function EventCountdown({
  date,
  today,
}: {
  date: string;
  today?: string;
}) {
  const { prefix, primary, suffix, detail } = countdownParts(date, today);

  return (
    <>
      {prefix && `${prefix} `}
      <strong>{primary}</strong>
      {suffix && ` ${suffix}`}
      {detail && <small>（{detail}）</small>}
    </>
  );
}
