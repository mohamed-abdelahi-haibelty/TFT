import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NOINDEX } from "@/src/lib/seo";

/** The 404 status is the authoritative signal; this is the belt to its braces, for anything served out of the app shell before the status lands. */
export const metadata: Metadata = NOINDEX;

export default function CatchAll() {
  notFound();
}
