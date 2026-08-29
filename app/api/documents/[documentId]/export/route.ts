import { auth, authSessionConfiguration } from "@/auth/auth";
import { exportOwnedDocumentVersion } from "@/documents/export";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  if (!authSessionConfiguration) return new Response(null, { status: 401 });
  const session = await auth();
  if (!session?.user?.id) return new Response(null, { status: 401 });
  const { documentId } = await context.params;
  const url = new URL(request.url);
  const documentVersionId = url.searchParams.get("version") || undefined;
  const result = await exportOwnedDocumentVersion({ userId: session.user.id, documentId, documentVersionId, format: "pdf" });
  if (result.kind === "not_found") return new Response(null, { status: 404 });
  if (result.kind === "accepted-version-required") return new Response(JSON.stringify({ error: result.kind }), { status: 409, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
  if (result.kind !== "pdf") return new Response(JSON.stringify({ error: result.kind }), { status: 422, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
  return new Response(new Uint8Array(result.bytes), { status: 200, headers: { "Content-Type": result.contentType, "Content-Disposition": `attachment; filename="${result.filename}"`, "Cache-Control": "private, no-store" } });
}
