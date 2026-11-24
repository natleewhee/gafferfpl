import { test, expect } from "@playwright/test";

/* What a shared link shows in WhatsApp or Telegram: the page's Open Graph tags and the card image
 * itself (src/app/opengraph-image.tsx). */
test("a shared link has a title, a description and a 1200x630 card image", async ({ page, request }) => {
  await page.goto("/");
  const meta = (key: string) => page.locator(`meta[property="${key}"], meta[name="${key}"]`).first().getAttribute("content");
  expect(await meta("og:title")).toBe("GafferFPL");
  expect(await meta("og:description")).toMatch(/captain pick, transfer plans and live rank/);
  expect(await meta("twitter:card")).toBe("summary_large_image");
  expect(await meta("og:image:width")).toBe("1200");
  expect(await meta("og:image:height")).toBe("630");
  const src = new URL((await meta("og:image"))!);
  const res = await request.get(src.pathname + src.search);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
  const png = await res.body();
  // PNG header, then the IHDR chunk: width and height as big-endian 32-bit numbers
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});
