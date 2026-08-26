import { ImageResponse } from "next/og";

/** Browser-tab monogram. `favicon.ico` still serves `/favicon.ico`; this adds the modern PNG `rel="icon"` Next links from every page. */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 15,
          letterSpacing: -0.5,
        }}
      >
        TFT
      </div>
    ),
    size,
  );
}
