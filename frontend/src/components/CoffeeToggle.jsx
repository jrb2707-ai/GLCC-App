import React from "react";

// Default/Secondary picker for a single coffee order. Local to whichever
// button renders it — switching here only changes what THIS order submits,
// never the rider's saved defaults (those live in Profile). Secondary is
// genuinely unpressable (not just dimmed) until the rider has one saved.
export default function CoffeeToggle({ value, onChange, secondary, testId = "coffee-toggle" }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5" data-testid={testId}>
      <button
        type="button"
        onClick={() => onChange("default")}
        className={`flex-1 text-[9px] font-black uppercase tracking-widest py-1.5 rounded-lg border ${
          value === "default"
            ? "bg-accent-pink/20 border-accent-pink text-accent-pink"
            : "bg-bg-primary border-border-subtle text-text-muted"
        }`}
        data-testid={`${testId}-default`}
      >
        Default
      </button>
      <button
        type="button"
        onClick={() => onChange("secondary")}
        disabled={!secondary}
        className={`flex-1 text-[9px] font-black uppercase tracking-widest py-1.5 rounded-lg border ${
          !secondary
            ? "bg-bg-primary border-border-subtle text-text-muted/50 opacity-60 cursor-not-allowed"
            : value === "secondary"
              ? "bg-accent-pink/20 border-accent-pink text-accent-pink"
              : "bg-bg-primary border-border-subtle text-text-muted"
        }`}
        data-testid={`${testId}-secondary`}
      >
        {secondary ? "Secondary" : "Add in Profile"}
      </button>
    </div>
  );
}
