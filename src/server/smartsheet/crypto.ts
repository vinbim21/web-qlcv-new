import crypto from "node:crypto";

// Mã hóa token Smartsheet trước khi lưu DB (AES-256-GCM).
// Key dẫn xuất từ SMARTSHEET_TOKEN_SECRET (ưu tiên) hoặc AUTH_SECRET — không cần thêm env mới.
function getKey(): Buffer {
  const secret = process.env.SMARTSHEET_TOKEN_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("Thiếu SMARTSHEET_TOKEN_SECRET/AUTH_SECRET trong env");
  return crypto.createHash("sha256").update(secret).digest();
}

/** Trả chuỗi "iv.tag.cipher" (base64) để lưu vào User.smartsheetToken. */
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(stored: string): string {
  const parts = stored.split(".");
  if (parts.length !== 3) throw new Error("Token lưu trữ sai định dạng — hãy nhập lại token");
  const [iv, tag, enc] = parts.map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(enc!), decipher.final()]).toString("utf8");
}
