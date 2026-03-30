import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const BASE_URL = process.env.BASE_URL;

// shared memory (POC only)
const tempStore = global.tempStore || new Map();
global.tempStore = tempStore;

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
  console.log("Webhook received:", JSON.stringify(body, null, 2));

  try {
    const entry = body.entry?.[0];
    const msg = entry?.messaging?.[0];

    if (!msg) return NextResponse.json({ ok: true });

    const senderId = msg.sender.id;

    // 🧠 IMAGE HANDLING
    const attachments = msg.message?.attachments;

    if (attachments?.[0]?.type === "image") {
      const imageUrl = attachments[0].payload.url;

      // download image
      const imgRes = await fetch(imageUrl);
      const arrayBuffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      // GEMINI EDIT
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: base64,
                  mimeType: "image/jpeg",
                },
              },
              {
                text: "Apply a bright happy mood filter. Warm tones, vibrant colors, soft glow.",
              },
            ],
          },
        ],
      });

      const parts = response.candidates?.[0]?.content?.parts || [];

      let outputBuffer = null;

      for (const part of parts) {
        if (part.inlineData?.data) {
          outputBuffer = Buffer.from(part.inlineData.data, "base64");
        }
      }

      if (!outputBuffer) {
        console.log("No image returned from Gemini");
        return NextResponse.json({ ok: true });
      }

      // 🔥 STORE IN MEMORY
      const id = Date.now().toString();
      tempStore.set(id, outputBuffer);

      // auto cleanup
      setTimeout(() => tempStore.delete(id), 2 * 60 * 1000);

      const publicUrl = `https://temp-insta-dm.vercel.app/api/instagram/webhook/api/image/${id}`;
      console.log("Generated image URL:", publicUrl);
      // 🔥 SEND IMAGE BACK
      await fetch(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: senderId },
            message: {
              attachment: {
                type: "image",
                payload: {
                  url: publicUrl,
                },
              },
            },
          }),
        },
      );

      return NextResponse.json({ ok: true });
    }

    // 🧠 TEXT FALLBACK
    const text = msg.message?.text;

    if (!text) return NextResponse.json({ ok: true });

    const aiRes = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: `Reply short, human: ${text}`,
    });

    const reply = aiRes.text || "ok";

    await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: reply },
        }),
      },
    );
  } catch (e) {
    console.error("Webhook error:", e);
  }

  return NextResponse.json({ ok: true });
}
