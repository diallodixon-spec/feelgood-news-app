import { NextResponse } from "next/server";

const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const VOICE_NAME = "Kore"; // one of Gemini's prebuilt voices — swap this to change the narrator

// Director's note — steers style/pace/accent. Gemini's TTS model reads natural-language
// direction like this as performance instruction rather than text to speak aloud.
const DIRECTOR_NOTE = `# Director's note
Style: Professional. Pace: Natural but on the faster side. Accent: Jamaican, but more neutral than Jamaican.`;

// Gemini's TTS endpoint returns raw headerless PCM audio (16-bit signed,
// typically 24kHz mono) inside inlineData, not a playable file. Browsers
// can't play raw PCM directly via <audio>, so we wrap it in a minimal WAV
// header ourselves before sending it back to the frontend.
function pcmToWav(pcmBuffer, sampleRate, numChannels, bitDepth) {
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = pcmBuffer.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Parses "audio/L16;rate=24000" style mimeType strings Gemini returns
function parseSampleRate(mimeType) {
  const match = /rate=(\d+)/.exec(mimeType || "");
  return match ? parseInt(match[1], 10) : 24000;
}

export async function POST(request) {
  const { text } = await request.json();

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY environment variable is not set." },
      { status: 500 }
    );
  }

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${DIRECTOR_NOTE}\n\nSay: ${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: VOICE_NAME },
              },
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      return NextResponse.json(
        { error: `Gemini TTS request failed: ${errBody}` },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const part = geminiData.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!part?.data) {
      return NextResponse.json(
        { error: "Gemini returned no audio data." },
        { status: 502 }
      );
    }

    const pcmBuffer = Buffer.from(part.data, "base64");
    const sampleRate = parseSampleRate(part.mimeType);
    const wavBuffer = pcmToWav(pcmBuffer, sampleRate, 1, 16);

    return new NextResponse(wavBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": wavBuffer.length.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Unknown error calling Gemini TTS." },
      { status: 500 }
    );
  }
}
