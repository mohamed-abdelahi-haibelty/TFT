import { ImageResponse } from "next/og";

/** iOS home-screen icon. Apple does not round-trip `favicon.ico`, so without this a saved shortcut renders a screenshot of the page. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1A1613",
          color: "#FAF9F7",
          fontSize: 66,
          letterSpacing: -2,
        }}
      >
        TFT
      </div>
    ),
    size,
  );
}
