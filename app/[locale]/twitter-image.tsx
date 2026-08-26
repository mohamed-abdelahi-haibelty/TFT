// Twitter's crawler falls back to `og:image` on its own, but naming the image
// explicitly costs one line and removes the guess.
export { default, size, contentType, alt, generateStaticParams } from "./opengraph-image";
