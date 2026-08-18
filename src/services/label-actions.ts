"use server";

import type { ServiceResult } from "@/src/lib/errors";
import { saveLabelSheetSelection } from "@/src/services/labels";

export async function saveLabelSheetSelectionAction(items: unknown): Promise<ServiceResult<null>> {
  return saveLabelSheetSelection(items);
}
