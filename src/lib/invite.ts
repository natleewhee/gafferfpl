/** What "Invite a friend" shares: the app's own address with no `?team=`, so the
 * friend lands on the team-ID screen and looks up their own squad. Kept free of
 * React so it can be unit-tested. */
export const INVITE_TEXT =
  "GafferFPL: your FPL captain pick, transfer plans and live rank, on your phone. Open it and type your team ID.";

export function inviteShareData(origin: string, pathname = "/"): { url: string; title: string; text: string } {
  return { url: `${origin}${pathname || "/"}`, title: "GafferFPL", text: INVITE_TEXT };
}
