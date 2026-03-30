import { NextResponse } from "next/server";

const tempStore = globalThis.tempStore || new Map();
globalThis.tempStore = tempStore;

export async function GET(req, context) {
  const { params } = context;
  const id = params?.id;

  if (!id) {
    return new NextResponse("Missing ID", { status: 400 });
  }

  const buffer = tempStore.get(id);

  if (!buffer) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg", // match what you're generating
      "Cache-Control": "no-store",
    },
  });
}
