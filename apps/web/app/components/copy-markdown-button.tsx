/**
 * "Copy as Markdown" for the skill page.
 *
 * The button copies the response of the page's own `/skills/:slug.md` resource
 * rather than assembling Markdown in the browser. That choice is the security
 * property: the route applies the protected payload boundary server-side, so a
 * viewer without entitlement copies the withheld-body document and cannot
 * accidentally be handed a payload the server would not have served them. It
 * also means there is exactly one Markdown renderer, not two that can drift.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyState = "idle" | "copied" | "error";

export function CopyMarkdownButton({
  url,
  label = "Copy as Markdown",
}: {
  url: string;
  label?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Fetched as text and copied verbatim: the server decided what this
      // viewer may read, and the button must not reshape that answer.
      const markdown = await response.text();
      await navigator.clipboard.writeText(markdown);
      setState("copied");
    } catch (error) {
      // A failed copy is reported, not swallowed: silently doing nothing looks
      // like a successful copy of an empty document.
      console.error("Copy as Markdown failed:", error);
      setState("error");
    } finally {
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const text = state === "copied" ? "Copied" : state === "error" ? "Copy failed" : label;

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-md border border-sx-border px-2 py-1 text-xs text-sx-fg-muted transition-colors hover:border-mint/40 hover:text-mint"
    >
      {state === "copied" ? <Check size={12} /> : <Copy size={12} />}
      <span>{text}</span>
    </button>
  );
}
