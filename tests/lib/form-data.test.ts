import { describe, expect, it } from "vitest";
import { readJsonArray } from "@/src/lib/form-data";

function formDataWith(name: string, value: string): FormData {
  const data = new FormData();
  data.set(name, value);
  return data;
}

describe("readJsonArray", () => {
  it("parses a well-formed array", () => {
    expect(readJsonArray(formDataWith("images", '["a","b"]'), "images")).toEqual(["a", "b"]);
  });

  it("returns an empty array for a missing or blank field", () => {
    expect(readJsonArray(new FormData(), "images")).toEqual([]);
    expect(readJsonArray(formDataWith("images", ""), "images")).toEqual([]);
    expect(readJsonArray(formDataWith("images", "   "), "images")).toEqual([]);
  });

  it("swallows malformed JSON instead of throwing out of the server action", () => {
    // A throw here escapes the action entirely: `useActionState` never gets a
    // result and the form shows nothing at all.
    expect(() => readJsonArray(formDataWith("images", "{not json"), "images")).not.toThrow();
    expect(readJsonArray(formDataWith("images", "{not json"), "images")).toEqual([]);
  });

  it("rejects valid JSON that is not an array, so Zod sees a shape it can reject", () => {
    expect(readJsonArray(formDataWith("items", '{"a":1}'), "items")).toEqual([]);
    expect(readJsonArray(formDataWith("items", '"a string"'), "items")).toEqual([]);
    expect(readJsonArray(formDataWith("items", "42"), "items")).toEqual([]);
  });
});
