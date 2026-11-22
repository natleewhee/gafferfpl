import { test } from "node:test";
import assert from "node:assert/strict";
import { INVITE_TEXT, inviteShareData } from "@/lib/invite";

test("an invite is the app's address with no team in it", () => {
  const data = inviteShareData("https://fplforecast.vercel.app", "/");
  assert.equal(data.url, "https://fplforecast.vercel.app/");
  assert.doesNotMatch(data.url, /team=/);
  assert.equal(data.text, INVITE_TEXT);
  assert.equal(inviteShareData("https://x.example", "").url, "https://x.example/");
});
