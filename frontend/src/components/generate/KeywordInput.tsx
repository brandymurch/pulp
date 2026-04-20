"use client";
import { Input } from "@/components/shared/Input";

interface KeywordInputProps {
  keyword: string;
  city: string;
  state: string;
  onKeywordChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onStateChange: (v: string) => void;
}

export function KeywordInput({ keyword, city, state, onKeywordChange, onCityChange, onStateChange }: KeywordInputProps) {
  return (
    <div className="flex gap-3 items-end">
      <div className="flex-1">
        <Input label="Target keyword" placeholder="insulation services in Columbus OH" value={keyword} onChange={e => onKeywordChange(e.target.value)} />
      </div>
      <div className="w-[180px]">
        <Input label="City" placeholder="Columbus" value={city} onChange={e => onCityChange(e.target.value)} />
      </div>
      <div className="w-[80px]">
        <Input label="State" placeholder="OH" value={state} onChange={e => onStateChange(e.target.value)} />
      </div>
    </div>
  );
}
