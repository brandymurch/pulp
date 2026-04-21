"use client";
import { useState, useEffect } from "react";

export interface PipelineStep {
  label: string;
  status: "pending" | "loading" | "done" | "failed" | "skipped";
}

interface PipelineProgressProps {
  steps: PipelineStep[];
}

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = mins > 0
    ? `${mins}:${secs.toString().padStart(2, "0")}`
    : `${secs}s`;

  return (
    <span className="text-[10px] text-ink-40 font-mono tabular-nums">{display}</span>
  );
}

export function PipelineProgress({ steps }: PipelineProgressProps) {
  const hasLoading = steps.some(s => s.status === "loading");
  const doneCount = steps.filter(s => s.status === "done").length;
  const totalActive = steps.filter(s => s.status !== "skipped").length;

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
    <div className="border-[1.5px] border-line rounded-[14px] bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.22em] uppercase text-ink-70">
          Research {hasLoading ? "in progress" : "complete"} ({doneCount}/{totalActive})
        </div>
        {hasLoading && <ElapsedTimer />}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
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
      {hasLoading && (
        <div className="text-[11px] text-ink-40">
          SEO analysis can take up to 2 minutes for competitive keywords.
        </div>
      )}
    </div>
  );
}
