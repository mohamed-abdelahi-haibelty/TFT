/**
 * Server actions receive `FormData`, which carries only strings — the array
 * fields (images, variants, bundle items, promotion item ids) are posted as
 * JSON in a hidden input. A bare `JSON.parse` on that value throws *outside*
 * the service's Zod boundary, which escapes the action entirely: the client's
 * `useActionState` never receives a result, so the form clears its pending
 * state and shows nothing at all.
 *
 * Parsing defensively here turns a malformed payload back into ordinary
 * `VALIDATION` feedback, since an empty array fails the same schemas a garbage
 * one would.
 */
export function readJsonArray(formData: FormData, name: string): unknown[] {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
