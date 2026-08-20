import React from "react";
import { initials } from "../lib/util";

const SIZES = {
  xs: "w-6 h-6 text-[10px] rounded-full",
  sm: "w-9 h-9 text-xs rounded-xl",
  md: "w-10 h-10 text-sm rounded-xl",
  lg: "w-14 h-14 text-xl rounded-2xl",
};

export default function Avatar({ name, photo, size = "sm", className = "", testId }) {
  const cls = SIZES[size] || SIZES.sm;
  const common = `${cls} ${className} flex items-center justify-center overflow-hidden flex-none`;
  if (photo) {
    return (
      <div className={`${common} bg-bg-primary border border-border-subtle`} data-testid={testId}>
        <img src={photo} alt={name || "rider"} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`${common} bg-accent-volt/15 text-accent-volt font-heading font-black`}
      data-testid={testId}
    >
      {initials(name || "?")}
    </div>
  );
}
