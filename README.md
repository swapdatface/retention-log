# Swap Dat Face - Retention Log

Swap Dat Face is a face swap service built for creative use. We minimize retained data and keep default retention short.

This repository contains the code for the public retention log endpoint used by [swapdatface.com](https://swapdatface.com).

The endpoint publishes a signed, machine-readable snapshot of retention behavior in production. It is a transparency tool, not a cryptographic proof of every deletion event.

---

## Live links

- Live retention log: [https://swapdatface.com/api/retention](https://swapdatface.com/api/retention)
- Public signing key: [https://swapdatface.com/api/retention/signing-key](https://swapdatface.com/api/retention/signing-key)
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
- Ed25519 signature over canonical JSON
- public key URL for independent verification

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
    "run_id": "aggregate:2026-03-09T14:21:12.054Z:2026-03-09T13:55:06.092Z",
    "started_at": "2026-03-09T13:55:06.092Z",
    "finished_at": "2026-03-09T14:21:12.263Z",
    "status": "success",
    "scanned_objects": 55,
    "deleted_objects": 36,
    "errors": 0
  },
  "evidence": {
    "oldest_remaining_object_age_seconds": 883,
    "notes": "Oldest remaining object age is sampled from non-video media and 30-minute-retention video media only."
  },
  "server_time": "2026-03-09T14:22:04.020Z",
  "signing": {
    "alg": "Ed25519",
    "key_id": "retention-ed25519-v1",
    "payload_sha256": "33e71d1a7fde09859f84eba533100f24009c2c5b5aac9d2ce0d07eefe5ecc947",
    "signature": "ae3ec2f16978d158c3c18ed248a02fd607db31a08bfd969915551b6619a81756af5f22f54adb65c4532ff18860b0a8f7490397e103e7158b5fbe97ae23614308",
    "public_key_url": "/api/retention/signing-key"
  }
}
```

---

## Public verification model

The endpoint signs canonical JSON using Ed25519 and publishes the matching public key.

- canonicalization is stable key sorting
- `payload_sha256` is SHA-256 of the canonical payload
- `signature` is Ed25519 over the canonical payload
- `public_key_url` points to the verification key endpoint
- `key_id` supports future key rotation

That means anyone can fetch a payload, canonicalize the unsigned fields, verify the hash, and verify the Ed25519 signature offline with the published public key.

---

## Why counts can be zero

It is valid for `scanned_objects`, `deleted_objects`, and `oldest_remaining_object_age_seconds` to be zero/null when there are no objects left in the public scope.

Long-retention (30-day) video objects may still exist internally and are intentionally excluded from these public totals.

---

## Trust + limitations

This log is an operational transparency measure.

It can show:

- configured retention policy values
- cleanup activity and recency
- whether scoped retention evidence looks healthy
- that a retained payload was signed by the service

It cannot prove deletion of one specific user object under every failure scenario or eliminate operator trust.

---

## Repository contents

- `retention.ts` - public retention endpoint
- `retention-signing.ts` - canonicalization and signing helpers
- `signing-key.ts` - public verification key endpoint

---

## Operational notes

- cleanup cadence is approximately every 14 minutes
- public evidence scope is short-retention only
- retention policy includes buffer for scheduler drift and transient failures

---

## License

MIT License. See [LICENSE](./LICENSE).
