import React from "react";
import { Input, Label } from "./ui";

export default function DateRange({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-[180px]">
        <Label>Data inicial</Label>
        <Input
          type="date"
          value={start}
          onChange={(e) => onChange({ start: e.target.value, end })}
        />
      </div>
      <div className="w-[180px]">
        <Label>Data final</Label>
        <Input
          type="date"
          value={end}
          onChange={(e) => onChange({ start, end: e.target.value })}
        />
      </div>
    </div>
  );
}
