import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
} from "node:crypto";

export const RETENTION_SIGNING_PUBLIC_KEY_PATH = "/api/retention/signing-key";

export interface RetentionSigningMetadata {
  alg: "Ed25519";
  key_id: string;
  payload_sha256: string;
  signature: string;
  public_key_url: string;
}

export interface RetentionPublicKey {
  alg: "Ed25519";
  key_id: string;
  format: "pem";
  public_key_pem: string;
  public_key_sha256: string;
}

function normalizeMultilineEnv(value: string): string {
  const normalized = value.replace(/\\n/g, "\n").trim();
  return normalized ? `${normalized}\n` : "";
}

function getRetentionKeyId(): string {
  const configuredKeyId = process.env.RETENTION_SIGNING_KEY_ID?.trim();
  if (configuredKeyId) return configuredKeyId;
  return "retention-ed25519-v1";
}

function getEd25519PrivateKeyPem(): string {
  const privateKeyPem = process.env.RETENTION_SIGNING_PRIVATE_KEY_PEM?.trim();
  if (!privateKeyPem) throw new Error("Missing RETENTION_SIGNING_PRIVATE_KEY_PEM environment variable");
  return normalizeMultilineEnv(privateKeyPem);
}

function getEd25519PublicKeyPem(privateKeyPem: string): string {
  const configuredPublicKeyPem = process.env.RETENTION_SIGNING_PUBLIC_KEY_PEM?.trim();
  if (configuredPublicKeyPem) {
    return normalizeMultilineEnv(configuredPublicKeyPem);
  }

  const publicKey = createPublicKey(createPrivateKey(privateKeyPem)).export({
    type: "spki",
    format: "pem",
  });

  return typeof publicKey === "string" ? publicKey : publicKey.toString("utf8");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function getRetentionPublicKey(): RetentionPublicKey {
  const privateKeyPem = getEd25519PrivateKeyPem();
  const publicKeyPem = getEd25519PublicKeyPem(privateKeyPem);

  return {
    alg: "Ed25519",
    key_id: getRetentionKeyId(),
    format: "pem",
    public_key_pem: publicKeyPem,
    public_key_sha256: createHash("sha256").update(publicKeyPem).digest("hex"),
  };
}

export function signRetentionPayload(payload: object): RetentionSigningMetadata {
  const canonicalJson = stableStringify(payload);
  const payloadSha256 = createHash("sha256").update(canonicalJson).digest("hex");
  const privateKeyPem = getEd25519PrivateKeyPem();
  const signature = cryptoSign(null, Buffer.from(canonicalJson), createPrivateKey(privateKeyPem)).toString("hex");

  return {
    alg: "Ed25519",
    key_id: getRetentionKeyId(),
    payload_sha256: payloadSha256,
    signature,
    public_key_url: RETENTION_SIGNING_PUBLIC_KEY_PATH,
  };
}
