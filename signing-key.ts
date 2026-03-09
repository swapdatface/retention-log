import { NextResponse } from "next/server";
import { getRetentionPublicKey } from "./retention-signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const serverTime = new Date().toISOString();
  const signingKey = getRetentionPublicKey();

  if (!signingKey) {
    return NextResponse.json(
      {
        error: "retention_signing_key_unavailable",
        message: "Public retention signing key is not configured.",
        server_time: serverTime,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return NextResponse.json(
    {
      schema_version: 1,
      signing_key: signingKey,
      server_time: serverTime,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}
