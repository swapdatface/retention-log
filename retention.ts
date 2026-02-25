import { NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";
import redis from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_VIDEO_RETENTION_MINUTES = 30;
const EXTENDED_VIDEO_RETENTION_DAYS = 30;
const BASE_ORPHAN_RETENTION_MINUTES = 30;
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

type StoredReportWithExtras = StoredReport & Record<string, unknown>;
const hasOwn = Object.prototype.hasOwnProperty;

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

function isStoredReport(value: unknown): value is StoredReport {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    const status = candidate.status;
    return (
        typeof candidate.run_id === "string"
        && typeof candidate.started_at === "string"
        && typeof candidate.finished_at === "string"
        && (status === "success" || status === "partial" || status === "failed")
        && typeof candidate.scanned_objects === "number"
        && typeof candidate.deleted_objects === "number"
        && typeof candidate.errors === "number"
        && (
            candidate.oldest_remaining_object_age_seconds === null
            || typeof candidate.oldest_remaining_object_age_seconds === "number"
        )
        && typeof candidate.server_time === "string"
    );
}

function parseStoredReport(raw: unknown): StoredReportWithExtras | null {
    if (!raw) return null;
    try {
        const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
        return isStoredReport(parsed) ? (parsed as StoredReportWithExtras) : null;
    } catch {
        return null;
    }
}

function readOptionalNumber(report: StoredReportWithExtras | null, key: string): number | null {
    if (!report) return null;
    const value = report[key];
    return typeof value === "number" ? value : null;
}

function readOptionalNullableNumber(report: StoredReportWithExtras | null, key: string): number | null {
    if (!report) return null;
    const value = report[key];
    if (value === null) return null;
    return typeof value === "number" ? value : null;
}

function maxNullable(values: Array<number | null>): number | null {
    let maxValue: number | null = null;
    for (const value of values) {
        if (typeof value !== "number") continue;
        if (maxValue === null || value > maxValue) {
            maxValue = value;
        }
    }
    return maxValue;
}

function combineStatus(statuses: StoredReport["status"][]): StoredReport["status"] {
    if (statuses.length === 0) return "failed";
    if (statuses.length === 1) return statuses[0];
    if (statuses.includes("failed")) return "partial";
    if (statuses.includes("partial")) return "partial";
    return "success";
}

function parseIsoMs(value: string): number | null {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
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
        const [rawVideoReport, rawGeneralReport] = await Promise.all([
            redis.get("retention:last_report:video"),
            redis.get("retention:last_report"),
        ]);

        if (!rawVideoReport && !rawGeneralReport) {
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

        const videoReport = parseStoredReport(rawVideoReport);
        const generalReport = parseStoredReport(rawGeneralReport);

        if (!videoReport && !generalReport) {
            return NextResponse.json(
                {
                    error: "retention_report_unavailable",
                    message: "Retention report format is invalid. Please try again shortly.",
                    server_time: serverTime,
                },
                {
                    status: 503,
                    headers: { "Cache-Control": "no-store" },
                }
            );
        }

        const availableReports = [generalReport, videoReport].filter(
            (report): report is StoredReportWithExtras => report !== null
        );
        const statuses = availableReports.map((report) => report.status);

        const photoScannedObjects = readOptionalNumber(generalReport, "scanned_non_video_short_retention_objects")
            ?? readOptionalNumber(generalReport, "scanned_non_video_objects")
            ?? generalReport?.scanned_objects
            ?? 0;
        const photoDeletedObjects = readOptionalNumber(generalReport, "deleted_non_video_short_retention_objects")
            ?? generalReport?.deleted_objects
            ?? 0;
        const photoErrors = readOptionalNumber(generalReport, "errors_non_video_short_retention")
            ?? generalReport?.errors
            ?? 0;
        const hasScopedPhotoOldestField = Boolean(
            generalReport
            && hasOwn.call(generalReport, "oldest_remaining_non_video_short_retention_object_age_seconds")
        );
        const photoOldestRemainingAgeSeconds = hasScopedPhotoOldestField
            ? readOptionalNullableNumber(
                generalReport,
                "oldest_remaining_non_video_short_retention_object_age_seconds"
            )
            : (generalReport?.oldest_remaining_object_age_seconds ?? null);

        const shortRetentionVideoScannedObjects = readOptionalNumber(videoReport, "scanned_short_retention_objects") ?? 0;
        const shortRetentionVideoDeletedObjects = readOptionalNumber(videoReport, "deleted_short_retention_objects") ?? 0;
        const shortRetentionVideoErrors = readOptionalNumber(videoReport, "errors_short_retention") ?? 0;
        const shortRetentionVideoOldestRemainingAgeSeconds = readOptionalNullableNumber(
            videoReport,
            "oldest_remaining_short_retention_object_age_seconds"
        );

        const aggregateScannedObjects = photoScannedObjects + shortRetentionVideoScannedObjects;
        const aggregateDeletedObjects = photoDeletedObjects + shortRetentionVideoDeletedObjects;
        const aggregateErrors = photoErrors + shortRetentionVideoErrors;
        const aggregateOldestRemainingAgeSeconds = maxNullable([
            photoOldestRemainingAgeSeconds,
            shortRetentionVideoOldestRemainingAgeSeconds,
        ]);

        const startedAtMs = availableReports
            .map((report) => parseIsoMs(report.started_at))
            .filter((value): value is number => value !== null);
        const finishedAtMs = availableReports
            .map((report) => parseIsoMs(report.finished_at))
            .filter((value): value is number => value !== null);
        const aggregateStartedAt = startedAtMs.length > 0
            ? new Date(Math.min(...startedAtMs)).toISOString()
            : serverTime;
        const aggregateFinishedAt = finishedAtMs.length > 0
            ? new Date(Math.max(...finishedAtMs)).toISOString()
            : serverTime;
        const aggregateRunId = `aggregate:${generalReport?.run_id ?? "none"}:${videoReport?.run_id ?? "none"}`;

        const unsignedPayload = {
            schema_version: 1,
            policy: {
                default_video_retention_minutes: DEFAULT_VIDEO_RETENTION_MINUTES,
                extended_video_retention_days: EXTENDED_VIDEO_RETENTION_DAYS,
                non_video_or_orphan_retention_minutes: BASE_ORPHAN_RETENTION_MINUTES,
                cleanup_interval_minutes: CLEANUP_INTERVAL_MINUTES,
                description: "Retention evidence is calculated from non-video media plus video media on the 30-minute window. 30-day video retention objects are intentionally excluded from these public evidence totals.",
            },
            latest_run: {
                run_id: aggregateRunId,
                started_at: aggregateStartedAt,
                finished_at: aggregateFinishedAt,
                status: combineStatus(statuses),
                scanned_objects: aggregateScannedObjects,
                deleted_objects: aggregateDeletedObjects,
                errors: aggregateErrors,
            },
            evidence: {
                oldest_remaining_object_age_seconds: aggregateOldestRemainingAgeSeconds,
                notes: "Oldest remaining object age is sampled from non-video media and 30-minute-retention video media only.",
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
