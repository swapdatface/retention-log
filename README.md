# Swap Dat Face – Retention Log

Swap Dat Face is a small face swap service built for creative use. We try to minimise the data we handle and keep anything we do process short lived.

This repository contains the code for the **public retention log endpoint** used by  
https://swapdatface.com

The endpoint publishes a signed, machine readable snapshot of how data retention and cleanup behave in production. It exists to provide transparency into how the system operates, not to make absolute guarantees.

---

## TL;DR

This repository publishes a simple, observable log of data retention behaviour.

- Uploaded images and results are temporary
- Cleanup runs automatically and frequently
- Retention behaviour is visible via a public endpoint
- The payload is signed to prevent silent modification
- No user content or identifiers are included

This is intended to show how the system behaves in practice, not to claim perfect privacy.

---

## Live links

**Live retention log:**  
https://swapdatface.com/api/retention

**Source code:**  
https://github.com/swapdatface/retention-log

---

## What this endpoint is

The retention log endpoint returns a JSON document describing:

- The configured retention window
- The cleanup interval
- The most recent cleanup run
- Aggregate counts of scanned and deleted objects
- Sampled evidence used to validate the retention window
- Server time
- A cryptographic signature over the payload

The report is purely operational. It does not contain user content.

---

## Example response shape

```json
{
  "schema_version": 1,
  "policy": {
    "max_retention_minutes": 30,
    "cleanup_interval_minutes": 14,
    "description": "..."
  },
  "latest_run": {
    "run_id": "2026-01-21T21:05:46.115Z",
    "started_at": "2026-01-21T21:05:46.115Z",
    "finished_at": "2026-01-21T21:05:46.148Z",
    "status": "success",
    "scanned_objects": 0,
    "deleted_objects": 0,
    "errors": 0
  },
  "evidence": {
    "oldest_remaining_object_age_seconds": null,
    "notes": "Oldest remaining object age is sampled during cleanup to validate retention window."
  },
  "server_time": "2026-01-21T21:47:13.372Z",
  "signing": {
    "alg": "HMAC-SHA256",
    "key_id": "retention-v1",
    "payload_sha256": "…",
    "signature": "…"
  }
}
```

## Why this exists

Most online services include a privacy policy that says data is deleted after a certain period of time.

This endpoint exists to make that behaviour visible.

By publishing a retention log, we aim to show:
- what the retention configuration is
- when cleanup last ran
- whether cleanup is succeeding

The report does **not** include:
- images or generated results
- filenames or object keys
- URLs or access tokens
- user identifiers, fingerprints, or analytics IDs

This is a transparency measure, not a claim of perfect privacy.

---

## A note on trust and limitations

Like all online services, this system ultimately requires trust in the operator.

Without specialised confidential computing infrastructure, it is not possible to mathematically prove that a server never stores data under all possible conditions.

Rather than making absolute claims, we focus on:
- minimising what data is handled
- keeping retention windows short
- automating deletion
- publishing observable, operational information about how the system behaves

This information is provided to help users make an informed decision, not to eliminate trust entirely.

---

## Signing model

The retention log is signed using HMAC SHA-256 over a canonical JSON representation of the payload.

- Canonicalisation is performed by stable key sorting prior to hashing
- `payload_sha256` is the SHA-256 hash of the canonical payload
- `signature` is an HMAC SHA-256 signature of the same payload
- `key_id` exists to support future key rotation

If any field in the payload changes, the signature will no longer match.

---

## What this log can and cannot show

This log can show:
- the configured retention window
- that cleanup runs are executing
- that retention behaviour is being monitored

This log cannot show:
- deletion of a specific image belonging to a specific person
- behaviour of a user’s device or browser
- anything outside the scope of the published payload

---

## Operational notes

- Cleanup runs approximately every 14 minutes
- Objects older than the internal deletion threshold are removed
- The published 30 minute retention window includes buffer for scheduling delays or transient failures

---

## License

MIT License. See the LICENSE file for details.
