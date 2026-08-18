"use client";

// next.config.ts's `images.loaderFile` target — must have a default export
// and run in the browser, so it lives apart from cloudinary.ts's other
// exports (some of which are imported by server-only modules).
import { cloudinaryLoader } from "@/src/lib/cloudinary";

export default cloudinaryLoader;
