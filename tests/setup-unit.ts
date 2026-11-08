// Nonfunctional placeholders for pure tests; integration tests use setup.ts.
process.env.DATABASE_URL = "postgresql://unit:unit@unreachable.invalid/unit";
process.env.BETTER_AUTH_SECRET = "unit-test-placeholder-with-at-least-32-characters";
process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "unit-test";
process.env.CLOUDINARY_API_KEY = "unit-test";
process.env.CLOUDINARY_API_SECRET = "unit-test";
