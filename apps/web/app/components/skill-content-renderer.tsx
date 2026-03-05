import Markdown from "react-markdown";

interface SkillContentRendererProps {
  content: string;
  riskLabel?: string;
}

/** Renders skill markdown content with styled prose and optional risk badge */
export function SkillContentRenderer({ content, riskLabel }: SkillContentRendererProps) {
  return (
    <div className="relative">
      {riskLabel && riskLabel !== "unknown" && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span
            className={[
              "rounded-full px-2 py-0.5 font-medium",
              riskLabel === "safe" && "bg-green-500/20 text-green-400",
              riskLabel === "caution" && "bg-yellow-500/20 text-yellow-400",
              riskLabel === "danger" && "bg-red-500/20 text-red-400",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {riskLabel === "safe"
              ? "No Issues Detected"
              : riskLabel === "caution"
                ? "Review Recommended"
                : "Suspicious"}
          </span>
        </div>
      )}
      <div className="sx-prose">
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
}
