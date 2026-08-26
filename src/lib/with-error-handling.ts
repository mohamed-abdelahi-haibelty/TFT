import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { HTTP_STATUS_BY_ERROR_CODE, type ServiceResult } from "./errors";
import { logger } from "./logger";

type RouteHandler = (request: NextRequest) => Promise<ServiceResult<unknown>>;

export function withErrorHandling(handler: RouteHandler) {
  return async (request: NextRequest) => {
    try {
      const result = await handler(request);

      if (result.ok) {
        return NextResponse.json(result.data);
      }

      return NextResponse.json(
        { error: result.error },
        { status: HTTP_STATUS_BY_ERROR_CODE[result.error.code] },
      );
    } catch (error) {
      logger.error(
        "Unhandled route handler error",
        {
          message: error instanceof Error ? error.message : String(error),
          path: request.nextUrl.pathname,
        },
        error,
      );

      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Something went wrong." } },
        { status: 500 },
      );
    }
  };
}
