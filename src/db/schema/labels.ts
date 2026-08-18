import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, timestamps } from "./columns";

export type LabelSheetItem = { type: "product" | "variant" | "bundle"; id: string };

// One row per user: the whole counter-sheet selection is replaced wholesale
// on every save rather than tracked as individual rows, since the UI only
// ever needs "what is this user's current selection", never row-level
// history — see Task 06.
export const labelSheetSelections = pgTable("label_sheet_selections", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  items: jsonb("items").$type<LabelSheetItem[]>().notNull().default([]),
  ...timestamps,
});
