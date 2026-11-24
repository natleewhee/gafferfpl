import { ImageResponse } from "next/og";

/* The picture a shared link shows in WhatsApp, Telegram and the like: the app's name and what it
 * does, on a dark pitch in the app's colours. Drawn at build time (no data in it, so it never goes
 * stale) with ImageResponse's built-in font: no network, no font files. */

export const alt = "GafferFPL: your FPL captain, transfers and live rank, on your phone";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LINE = "rgba(255,255,255,0.22)";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "linear-gradient(160deg, #0b2a1d 0%, #06120d 55%, #06090f 100%)",
          color: "#f2f5f8",
          fontFamily: "sans-serif",
        }}
      >
        {/* pitch markings kept clear of the words: touchlines, a penalty box and its six-yard box */}
        <div style={{ position: "absolute", left: 60, top: 50, width: 1080, height: 530, border: `3px solid ${LINE}`, display: "flex" }} />
        <div style={{ position: "absolute", left: 960, top: 165, width: 180, height: 300, border: `3px solid ${LINE}`, display: "flex" }} />
        <div style={{ position: "absolute", left: 1080, top: 245, width: 60, height: 140, border: `3px solid ${LINE}`, display: "flex" }} />
        <div
          style={{
            position: "absolute",
            left: 120,
            top: 150,
            display: "flex",
            flexDirection: "column",
            width: 780,
          }}
        >
          <div style={{ fontSize: 34, letterSpacing: 6, color: "#35e0a1", fontWeight: 700 }}>FOR FPL MANAGERS</div>
          <div style={{ fontSize: 128, fontWeight: 800, lineHeight: 1.05, marginTop: 10 }}>GafferFPL</div>
          <div style={{ fontSize: 40, lineHeight: 1.3, marginTop: 24, color: "#c9d1db" }}>
            Your captain pick, transfer plans and live rank, on your phone. Type your team ID and go.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 90,
            bottom: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: 60,
            background: "#f2c94c",
            color: "#06090f",
            fontSize: 72,
            fontWeight: 800,
          }}
        >
          C
        </div>
      </div>
    ),
    size,
  );
}
