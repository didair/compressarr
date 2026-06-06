import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { PathSecurityError } from "./paths";

export function apiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request was invalid.",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof PathSecurityError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 403 },
    );
  }
  if (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  ) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "The requested path was not found." } },
      { status: 404 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 },
  );
}

export function notFound(message = "Resource not found."): NextResponse {
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message } },
    { status: 404 },
  );
}
