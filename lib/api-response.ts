import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(error: unknown, status = 400) {
  console.error(error);
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Dados inválidos", details: error.flatten() }, { status: 422 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado" }, { status });
}
