# Swap Dat Face - Retention Log

Swap Dat Face is a face swap service built for creative use. We minimize retained data and keep default retention short.

This repository contains the code for the public retention log endpoint used by [swapdatface.com](https://swapdatface.com).

The endpoint publishes a signed, machine-readable snapshot of retention behavior in production. It is a transparency tool, not a cryptographic proof of every deletion event.

---

## Live links

- Live retention log: [https://swapdatface.com/api/retention](https://swapdatface.com/api/retention)
- Source code: [https://github.com/swapdatface/retention-log](https://github.com/swapdatface/retention-log)

---

## What this endpoint reports

The payload reports policy + latest evidence for the public retention scope:

- non-video media in short-retention scope
- video media on 30-minute retention

The payload intentionally excludes 30-day video retention objects from public evidence totals.

The response includes:

- policy settings
- latest cleanup run window
- aggregate scanned/deleted/error totals for public scope
- sampled oldest remaining age in public scope
- server time
- HMAC signature over canonical JSON

No user content, object keys, or identifiers are returned.

---

## Example response shape

```json
{
  "schema_version": 1,
  "policy": {
    "default_video_retention_minutes": 30,
    "extended_video_retention_days": 30,
    "non_video_or_orphan_retention_minutes": 30,
    "cleanup_interval_minutes": 14,
    "description": "Retention evidence is calculated from non-video media plus video media on the 30-minute window. 30-day video retention objects are intentionally excluded from these public evidence totals."
  },
  "latest_run": {
    "run_id": "aggregate:2026-02-25T22:27:39.297Z:2026-02-25T22:27:39.029Z",
    "started_at": "2026-02-25T22:27:39.029Z",
    "finished_at": "2026-02-25T22:27:39.349Z",
    "status": "success",
    "scanned_objects": 0,
    "deleted_objects": 0,
    "errors": 0
  },
  "evidence": {
    "oldest_remaining_object_age_seconds": null,
    "notes": "Oldest remaining object age is sampled from non-video media and 30-minute-retention video media only."
  },
  "server_time": "2026-02-25T22:29:19.863Z",
  "signing": {
    "alg": "HMAC-SHA256",
    "key_id": "retention-v1",
    "payload_sha256": "...",
    "signature": "..."
  }
}
```

---

## Why counts can be zero

It is valid for `scanned_objects`, `deleted_objects`, and `oldest_remaining_object_age_seconds` to be zero/null when there are no objects left in the public scope.

Long-retention (30-day) video objects may still exist internally and are intentionally excluded from these public totals.

---

## Signing model

The endpoint signs canonical JSON using HMAC SHA-256.

- canonicalization is stable key sorting
- `payload_sha256` is SHA-256 of canonical payload
- `signature` is HMAC SHA-256 of canonical payload
- `key_id` supports future key rotation

If any payload field changes, signature verification fails.

---

## Trust + limitations

This log is an operational transparency measure.

It can show:

- configured retention policy values
- cleanup activity and recency
- whether scoped retention evidence looks healthy

It cannot prove deletion of one specific user object under every failure scenario.

---

## Operational notes

- cleanup cadence is approximately every 14 minutes
- public evidence scope is short-retention only
- retention policy includes buffer for scheduler drift and transient failures

---

## License

MIT License. See [LICENSE](./LICENSE).
