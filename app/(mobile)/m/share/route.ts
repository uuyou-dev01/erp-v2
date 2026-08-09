import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const query = new URLSearchParams();
  const title = String(form.get("title") || "").trim();
  const text = String(form.get("text") || "").trim();
  const url = String(form.get("url") || "").trim();
  if (title) query.set("title", title);
  if (text) query.set("text", text);
  if (url) query.set("url", url);
  query.set("shared", "1");
  return NextResponse.redirect(new URL(`/m/capture/price?${query.toString()}`, request.url), 303);
}
