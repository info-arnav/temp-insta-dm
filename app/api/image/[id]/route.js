import { NextResponse } from "next/server";

const tempStore = global.tempStore || new Map();
global.tempStore = tempStore;

export async function GET(req, { params }) {
  const buffer = tempStore.get(params.id);

  if (!buffer) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
    },
  });
}
