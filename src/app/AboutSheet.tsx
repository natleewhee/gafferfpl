"use client";

import BottomSheet from "./BottomSheet";

export const ISSUES_URL = "https://github.com/natleewhee/gafferfpl/issues";

/** What the app is, where its numbers come from, and what it keeps about a
 * visitor. Opened from Team options and from the first-visit screen, so a
 * friend can read it before typing anything. Every storage line here should
 * match what the code really does: the team cookie (teamId.ts) and the
 * display choices in localStorage (pitchView.ts, faceMode.ts, LeaguesPage,
 * duelClient.ts, RecapCard). */
export default function AboutSheet({ onClose, build }: { onClose: () => void; build?: string | null }) {
  return (
    <BottomSheet label="About GafferFPL" onClose={onClose}>
      <div className="space-y-3 text-xs text-ink-soft" data-testid="about-sheet">
        <h2 className="text-base font-semibold text-ink">About GafferFPL</h2>
        <p>
          A Fantasy Premier League helper for one manager at a time: it forecasts your next gameweek, picks a captain,
          tests transfers against your own squad and tracks your live rank.
        </p>
        <section className="space-y-1">
          <h3 className="font-semibold text-ink">Where the numbers come from</h3>
          <p>
            Squads, fixtures and scores come from the public Fantasy Premier League website. Anyone&apos;s team can be
            looked up by its ID there, which is all this app does. Forecasts are a model&apos;s estimates, not
            certainties.
          </p>
          <p>
            GafferFPL is an independent project. It is not made by, endorsed by or affiliated with the Premier League or
            Fantasy Premier League.
          </p>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold text-ink">What it keeps about you</h3>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Your team ID, in a cookie in this browser for 180 days, so the app opens on your team.</li>
            <li>
              Display choices (2D or 3D pitch, ball passing, photos or shirts, the league you last opened), in this
              browser only.
            </li>
            <li>No account, no email, no tracking or advertising cookies.</li>
            <li>
              The site&apos;s host (Vercel) keeps standard request logs, including IP addresses, for a short time.
              The app keeps no record of which teams were looked up; a forecast is cached for about 15 minutes so it
              loads fast the next time.
            </li>
          </ul>
          <p>To clear it all, clear this site&apos;s data in your browser settings.</p>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold text-ink">Something wrong?</h3>
          <p>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center font-medium text-[var(--accent)] underline"
            >
              Report a problem on GitHub
            </a>
          </p>
        </section>
        {build && <p className="font-mono text-ink-faint">build {build}</p>}
      </div>
    </BottomSheet>
  );
}
