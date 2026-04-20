"use client";

export interface PipelineStep {
  label: string;
  status: "pending" | "loading" | "done" | "failed" | "skipped";
}

interface PipelineProgressProps {
  steps: PipelineStep[];
}

export function PipelineProgress({ steps }: PipelineProgressProps) {
  const statusIcon = (status: PipelineStep["status"]) => {
    switch (status) {
      case "pending": return <span className="w-2 h-2 rounded-full bg-ink-40" />;
      case "loading": return <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />;
      case "done": return <span className="w-2 h-2 rounded-full bg-green" />;
      case "failed": return <span className="w-2 h-2 rounded-full bg-[#b91c1c]" />;
      case "skipped": return <span className="w-2 h-2 rounded-full bg-ink-20" />;
    }
  };

  const statusText = (status: PipelineStep["status"]) => {
    switch (status) {
      case "pending": return "text-ink-40";
      case "loading": return "text-ink";
      case "done": return "text-green";
      case "failed": return "text-[#b91c1c]";
      case "skipped": return "text-ink-40 line-through";
    }
  };

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 py-4 px-5 border-[1.5px] border-line rounded-[14px] bg-white">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          {statusIcon(step.status)}
          <span className={`text-[11px] tracking-[0.04em] ${statusText(step.status)}`}>
            {step.label}
            {step.status === "failed" && " (failed)"}
            {step.status === "skipped" && " (skipped)"}
          </span>
        </div>
      ))}
    </div>
  );
}
