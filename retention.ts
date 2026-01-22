import { NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";
import redis from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RETENTION_MINUTES = 30;
const CLEANUP_INTERVAL_MINUTES = 14;

interface StoredReport {
    run_id: string;
    started_at: string;
    finished_at: string;
    status: "success" | "partial" | "failed";
    scanned_objects: number;
    deleted_objects: number;
    errors: number;
    oldest_remaining_object_age_seconds: number | null;
    server_time: string;
}

function stableStringify(value: any): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function signPayload(payload: object): { payload_sha256: string; signature: string } {
    const secret = process.env.RETENTION_SIGNING_SECRET;
    if (!secret) throw new Error("Missing RETENTION_SIGNING_SECRET environment variable");

    const canonicalJson = stableStringify(payload);
    const payloadHash = createHash("sha256").update(canonicalJson).digest("hex");
    const signature = createHmac("sha256", secret).update(canonicalJson).digest("hex");

    return { payload_sha256: payloadHash, signature };
}

export async function GET() {
    const serverTime = new Date().toISOString();

    try {
        const raw = await redis.get("retention:last_report");

        if (!raw) {
            return NextResponse.json(
                {
                    error: "retention_report_unavailable",
                    message: "Retention report not available yet. Please try again shortly.",
                    server_time: serverTime,
                },
                {
                    status: 503,
                    headers: { "Cache-Control": "no-store" },
                }
            );
        }

        const report: StoredReport = typeof raw === "string" ? JSON.parse(raw) : (raw as any);

        const unsignedPayload = {
            schema_version: 1,
            policy: {
                max_retention_minutes: MAX_RETENTION_MINUTES,
                cleanup_interval_minutes: CLEANUP_INTERVAL_MINUTES,
                description: "We promise deletion within 30 minutes. In practice, cleanup runs every ~14 minutes and deletes objects older than 15 minutes. The 30-minute buffer accounts for potential cron failures.",
            },
            latest_run: {
                run_id: report.run_id,
                started_at: report.started_at,
                finished_at: report.finished_at,
                status: report.status,
                scanned_objects: report.scanned_objects,
                deleted_objects: report.deleted_objects,
                errors: report.errors,
            },
            evidence: {
                oldest_remaining_object_age_seconds: report.oldest_remaining_object_age_seconds,
                notes: "Oldest remaining object age is sampled during cleanup to validate retention window.",
            },
            server_time: serverTime,
        };

        const { payload_sha256, signature } = signPayload(unsignedPayload);

        return NextResponse.json(
            {
                ...unsignedPayload,
                signing: {
                    alg: "HMAC-SHA256",
                    key_id: "retention-v1",
                    payload_sha256,
                    signature,
                },
            },
            {
                headers: {
                    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
                },
            }
        );
    } catch (error) {
        console.error("Retention endpoint error:", error);
        return NextResponse.json(
            {
                error: "internal_error",
                message: "An unexpected error occurred.",
                server_time: serverTime,
            },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }
}
