import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// VERIFY
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  if (
    searchParams.get("hub.mode") === "subscribe" &&
    searchParams.get("hub.verify_token") === VERIFY_TOKEN
  ) {
    return new NextResponse(searchParams.get("hub.challenge"), { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// RECEIVE MESSAGE
export async function POST(req) {
  const body = await req.json();

  try {
    const entry = body.entry?.[0];
    const msg = entry?.messaging?.[0];

    if (!msg?.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const senderId = msg.sender.id;
    const text = msg.message.text;

    // 🔥 GEMINI CALL (your working setup)
    const aiRes = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: `You are a helpful assistant replying to Instagram DMs.
User: ${text}
Reply short, human, helpful.`,
    });

    const reply = aiRes.text || "ok";

    // 🔥 SEND BACK TO INSTAGRAM
    await fetch("https://graph.facebook.com/v18.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAGE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: { id: senderId },
        message: { text: reply },
      }),
    });
  } catch (e) {
    console.error("Webhook error:", e);
  }

  return NextResponse.json({ ok: true });
}
