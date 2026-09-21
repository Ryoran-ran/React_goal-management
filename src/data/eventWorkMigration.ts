import { db } from "./db";
import { normalizeEventWork } from "../lib/eventWork";

export async function migrateEventWork() {
  await db.transaction("rw", db.events, async () => {
    for (const event of await db.events.toArray()) {
      const normalized = normalizeEventWork(event);
      if (normalized !== event) await db.events.put(normalized);
    }
  });
}
