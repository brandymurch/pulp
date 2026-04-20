"use client";
import { useState, useRef, useCallback } from "react";
import { API_URL } from "@/lib/api";

export function useGeneration() {
  const [output, setOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ input_tokens: number; output_tokens: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (path: string, payload: any) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setOutput("");
    setIsGenerating(true);
    setError(null);
    setUsage(null);

    const token = localStorage.getItem("pulp_token");
    let fullText = "";

    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: "Generation failed" }));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk") {
              fullText += data.text;
              setOutput(fullText);
            } else if (data.type === "done") {
              setOutput(data.content);
              if (data.usage) setUsage(data.usage);
            } else if (data.type === "error") {
              setError(data.message);
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Generation failed");
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, []);

  return { output, setOutput, isGenerating, error, usage, generate, abort };
}
