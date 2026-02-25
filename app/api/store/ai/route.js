import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import authSeller from "@/middlewares/authSeller";
import { openai } from "@/configs/openai";


async function main(base64Image, mimeType) {
    // Client may send full data URL (data:image/...;base64,...) or raw base64
    const imageUrl =
        typeof base64Image === "string" && base64Image.startsWith("data:")
            ? base64Image
            : `data:${mimeType || "image/jpeg"};base64,${base64Image}`;

    const messages = [
        {
            role: "system",
            content: `You are a product listing assistant for an e-commerce platform.
Your job is to analyze an image of a product and generate structured data.

Respond ONLY with raw JSON (no code block, no markdown, no explanation).
The JSON must strictly follow this schema:
{"name": "string", "description": "string"}`,
        },
        {
            role: "user",
            content: [
                { type: "text", text: "Analyze this image and return name + description of the product." },
                { type: "image_url", image_url: { url: imageUrl } },
            ],
        },
    ];
    const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL,
        messages,
      });
  
      const raw = response.choices[0].message.content;

      // remove ````json or ``` wrappers if present
      const cleaned = raw.replace(/```json|```/g, '').trim();

      let parsed;

      try {
        parsed = JSON.parse(cleaned);
      } catch (error) {
        throw new Error("AI did not return valid JSON");
      }

      return parsed;
}

export async function POST(request) {
    try {
        const {userId} = getAuth(request);
        const isSeller = await authSeller(userId);
        if(!isSeller){
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await request.json();
        const { base64Image, mimeType } = body || {};
        if (!base64Image || typeof base64Image !== "string") {
            return NextResponse.json({ error: "Missing or invalid base64Image" }, { status: 400 });
        }

        const result = await main(base64Image, mimeType);

      return NextResponse.json({...result});

    } catch (error) {
        console.error("AI route error:", error);
        const message =
            error?.message ||
            error?.response?.data?.error?.message ||
            "Image analysis failed. Try another image or add details manually.";
        const status = error?.status === 401 ? 401 : 400;
        return NextResponse.json({ error: message }, { status });
    }
}