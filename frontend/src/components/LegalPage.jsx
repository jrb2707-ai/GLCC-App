import React from "react";

const PRIVACY = {
  title: "Privacy Policy",
  updated: "February 2026",
  body: [
    {
      lead:
        "Grey Lynn Cycle Club (\"GLCC\", \"we\") operates the GLCC mobile app and the greylynncc.com website. This policy explains what we collect, why, and how you can get rid of it.",
    },
    {
      heading: "Data we collect",
      list: [
        "Email address, name and coffee preference — to create your rider account.",
        "Password hash (never the plain password) — to sign you in.",
        "Your ride RSVPs and coffee orders — to power the club feed.",
        "Chat messages — visible to other approved club members.",
        "Push notification tokens (opt-in only) — to deliver ride and coffee alerts.",
        "A profile photo, only if you choose to upload one.",
      ],
    },
    {
      heading: "Data we do not collect",
      list: [
        "Your location, contacts, calendar or photo library (except the single file you pick when you tap \"change photo\").",
        "Advertising identifiers or third-party analytics identifiers.",
        "Payment information — GLCC is free.",
      ],
    },
    {
      heading: "Third parties",
      list: [
        "Resend.com — transactional email (password reset, ride reminders).",
        "OpenWeather — Auckland weather in the chat header.",
        "Strava — synced club events via the public Strava Club API.",
        "Expo Push — delivery of push notifications (Apple/Google routed).",
      ],
    },
    {
      heading: "Retention",
      list: [
        "Your account exists until you or an admin delete it.",
        "Coffee rounds auto-delete after 1 hour.",
        "Chat and rides remain in the club history so the archive stays coherent.",
        "When you delete your account, your chat messages are anonymised to \"Former rider\" so replies don't dangle.",
      ],
    },
    {
      heading: "Deleting your account",
      lead:
        "Open the app → tap your avatar → scroll to \"Delete my account\". Confirm with your password. Everything tied to your account (push tokens, blocks, reports, coffee rounds, RSVPs) is purged immediately.",
    },
    {
      heading: "Contact",
      lead:
        "Email jason@greylynncc.com if you'd like your data exported, corrected, or if this policy doesn't cover something you care about.",
    },
  ],
};

const SUPPORT = {
  title: "Support",
  updated: "February 2026",
  body: [
    {
      lead:
        "Something not working right? Locked out? Want a rider approved? Here's how to reach a human.",
    },
    {
      heading: "Fast answers",
      list: [
        "I can't sign in — tap \"Forgot password\" on the sign-in screen. If the email doesn't arrive within 5 minutes, check spam, then email us.",
        "I signed up but the app is read-only — you're in \"Pending\" state. An admin (usually JB) approves new riders within a day.",
        "I'm not getting push notifications — Profile → toggle the bell. On iOS, also check Settings → GLCC → Notifications is on.",
        "The chat says a message was blocked — you blocked that rider, or they blocked you. Open their Member Card to unblock.",
        "How do I delete my account? Profile → \"Delete my account\" → confirm with your password.",
      ],
    },
    {
      heading: "Report a rider or a message",
      lead:
        "In the app: long-press any chat message → pick a reason. On the web: hover a message → tap the flag icon. Every report goes straight to admins.",
    },
    {
      heading: "Still stuck?",
      lead:
        "Email jason@greylynncc.com — we respond within 24 hours. Include your rider email and a screenshot if you can.",
    },
  ],
};

function Section({ heading, lead, list }) {
  return (
    <section className="mb-8" data-testid={`legal-section-${(heading || "intro").toLowerCase().replace(/\s+/g, "-")}`}>
      {heading ? (
        <h2 className="font-heading uppercase text-[13px] tracking-[0.22em] text-neutral-500 mb-3">
          {heading}
        </h2>
      ) : null}
      {lead ? <p className="text-[15px] leading-relaxed text-neutral-800 mb-3">{lead}</p> : null}
      {list ? (
        <ul className="space-y-2">
          {list.map((item, i) => (
            <li key={i} className="text-[15px] leading-relaxed text-neutral-800 pl-4 relative">
              <span className="absolute left-0 top-2.5 w-1.5 h-1.5 rounded-full bg-[#D4FF00]" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default function LegalPage({ kind }) {
  const doc = kind === "privacy" ? PRIVACY : SUPPORT;
  return (
    <div className="min-h-screen w-full bg-white text-neutral-900" data-testid={`legal-page-${kind}`}>
      <header className="border-b border-neutral-200 bg-neutral-50">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-2"
            data-testid="legal-home-link"
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FF3B7F]" />
            <span className="font-heading font-black text-neutral-900 text-lg tracking-tight">
              GLCC.
            </span>
          </a>
          <span className="text-[11px] uppercase tracking-[0.25em] text-neutral-500 font-mono">
            Grey Lynn Cycle Club
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.25em] text-neutral-500 font-mono mb-2">
            Updated {doc.updated}
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black uppercase leading-none">
            {doc.title}
          </h1>
        </div>

        {doc.body.map((s, i) => (
          <Section key={i} {...s} />
        ))}

        <footer className="mt-12 pt-6 border-t border-neutral-200 text-[13px] text-neutral-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a href="/" className="hover:text-neutral-900" data-testid="legal-footer-home">
              Home
            </a>
            <a href="/privacy" className="hover:text-neutral-900" data-testid="legal-footer-privacy">
              Privacy
            </a>
            <a href="/support" className="hover:text-neutral-900" data-testid="legal-footer-support">
              Support
            </a>
            <a href="mailto:jason@greylynncc.com" className="hover:text-neutral-900">
              jason@greylynncc.com
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
