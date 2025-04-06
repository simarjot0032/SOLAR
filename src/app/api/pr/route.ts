/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("roofImage");
    const imageH = formData.get("roofHeight");
    const imageW = formData.get("roofWidth");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ result: "No file received" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    const prompt = `





Analyze the provided image to determine if it shows a roof that can support solar panel installation. First, verify whether the image clearly depicts a roof. Note that the roof may or may not be perfectly flat. In either case, measure the visible roof area (width and height in pixels) without adjusting these dimensions. 

Assume that each solar panel has fixed, identical dimensions (pre-calculated, for example based on standard solar panel measurements) and that there is a fixed 10‑pixel gap between adjacent panels. Then, calculate the maximum possible number of solar panels that can be arranged on the roof in a grid with the 10‑pixel gap between panels. If the roof is not completely flat, provide an estimation of the maximum possible output based on the available area. In all cases, the roof’s measured width and height remain the same.

Output:

Provide the results in JSON format without any special characters like commas, using the following keys:
- rooftop_detection: "Yes" or "No"

- max_solar_panels: the maximum number of 150x150 solar panels (with a fixed 10‑pixel gap between panels) that can be placed on the roof.
- note: a note explaining that the analysis assumes the roof dimensions remain constant regardless of flatness and that the calculation represents the maximum possible installation based solely on the available area. If the roof is not flat, this number is an estimation.

Assumptions:
- The roof is generally suitable for solar panel installation, even if it is not perfectly flat.
- Solar panels are installed with fixed, identical dimensions (150x150 pixels) with a uniform 10‑pixel gap between them.
- The visible roof area is measured as-is (in pixels), and no adjustments are made to the width and height regardless of flatness.
- If the roof is not clearly visible or suitable, return "No" for rooftop_detection.


Note: roof dimension in pixels are width ${imageW} and height ${imageH} also these are in pixel using this formauls 1 meter = 100 px


`;

    const parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "image/png",
          data: base64Image,
        },
      },
    ];

    const result: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: parts,
    });

    if (result.candidates && result.candidates[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.text) {
          try {
            let cleanText = part.text
              .replace("```json", "")
              .replace("```", "")
              .trim();
            console.log(cleanText, part.text);
            const parsedResponse = JSON.parse(cleanText);
            return NextResponse.json({ result: parsedResponse });
          } catch (jsonError) {
            console.error(
              "Error parsing Gemini response:",
              part.text,
              jsonError
            );
            return NextResponse.json(
              {
                result: "Gemini response was not valid JSON",
                error: jsonError,
              },
              { status: 500 }
            );
          }
        }
      }
      return NextResponse.json(
        { result: "No text response found" },
        { status: 500 }
      );
    } else {
      return NextResponse.json(
        { result: "No valid content in response" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Error in API route:", err);
    return NextResponse.json(
      { result: "Error processing request", error: err },
      { status: 500 }
    );
  }
}
