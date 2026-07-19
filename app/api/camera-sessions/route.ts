import { env } from "cloudflare:workers";

const SESSION_TTL_SECONDS = 10 * 60;
const MAX_DESCRIPTION_LENGTH = 100_000;

type SessionRow = {
  id: string;
  offer: string | null;
  answer: string | null;
  expires_at: number;
};

function database() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable.");
  return env.DB;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function serializeDescription(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_DESCRIPTION_LENGTH) return null;
  return serialized;
}

function publicSession(row: SessionRow) {
  return {
    id: row.id,
    offer: row.offer ? JSON.parse(row.offer) : null,
    answer: row.answer ? JSON.parse(row.answer) : null,
    expiresAt: row.expires_at,
  };
}

export async function POST() {
  const id = crypto.randomUUID().replaceAll("-", "");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  const db = database();
  await db.batch([
    db.prepare("DELETE FROM camera_sessions WHERE expires_at < ?").bind(now),
    db.prepare("INSERT INTO camera_sessions (id, offer, answer, created_at, expires_at) VALUES (?, NULL, NULL, ?, ?)").bind(id, now, expiresAt),
  ]);
  return json({ id, offer: null, answer: null, expiresAt }, 201);
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Thiếu mã phiên." }, 400);
  const now = Math.floor(Date.now() / 1000);
  const row = await database()
    .prepare("SELECT id, offer, answer, expires_at FROM camera_sessions WHERE id = ? AND expires_at >= ?")
    .bind(id, now)
    .first<SessionRow>();
  if (!row) return json({ error: "Phiên không tồn tại hoặc đã hết hạn." }, 404);
  return json(publicSession(row));
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: unknown; offer?: unknown; answer?: unknown };
  if (typeof body.id !== "string" || body.id.length !== 32) return json({ error: "Mã phiên không hợp lệ." }, 400);
  const offer = body.offer === undefined ? undefined : serializeDescription(body.offer);
  const answer = body.answer === undefined ? undefined : serializeDescription(body.answer);
  if ((body.offer !== undefined && !offer) || (body.answer !== undefined && !answer)) return json({ error: "Thông tin kết nối không hợp lệ." }, 400);
  if (offer === undefined && answer === undefined) return json({ error: "Không có dữ liệu cập nhật." }, 400);
  const now = Math.floor(Date.now() / 1000);
  const result = offer !== undefined
    ? await database().prepare("UPDATE camera_sessions SET offer = ? WHERE id = ? AND expires_at >= ?").bind(offer, body.id, now).run()
    : await database().prepare("UPDATE camera_sessions SET answer = ? WHERE id = ? AND expires_at >= ?").bind(answer, body.id, now).run();
  if (!result.meta.changes) return json({ error: "Phiên không tồn tại hoặc đã hết hạn." }, 404);
  return json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Thiếu mã phiên." }, 400);
  await database().prepare("DELETE FROM camera_sessions WHERE id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}
