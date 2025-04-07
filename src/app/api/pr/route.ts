/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("roofImage");
    const imageH = formData.get("roofHeight") || 0;
    const imageW = formData.get("roofWidth") || 0;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ result: "No file received" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    const prompt = `



 Improved and Accurate Prompt:

Step 1: Roof Detection
- Carefully analyze the provided image to confirm if it clearly depicts a rooftop suitable for solar panel installation.  
- The roof may or may not be perfectly flat, but must clearly appear as a roof structure.
- If the rooftop is not clearly visible or identifiable as a roof, return "rooftop_detection": "No".

Step 2: Roof Dimension Measurement
- Precisely measure the visible width and height of the roof in pixels directly from the provided image.
- Do NOT convert these dimensions into any other unit; keep them strictly in pixels.
- If measured dimensions result in zero, unrealistic, or unclear values, explicitly indicate "rooftop_detection": "No".

Step 3: Solar Panel Calculation
- Assume each solar panel has fixed dimensions of exactly 5669 pixels width x 5669 pixels height.
- Include a fixed 100-pixel gap between adjacent panels (horizontally and vertically).
- Compute the maximum number of solar panels that can fit entirely within the roof's measured area without overlapping or partially extending beyond the edges.

Calculation Guidance:
- Each panel requires (5669 + 100 pixels) horizontally and (5669 + 100 pixels) vertically, except for panels at the edges of the roof which do not require an additional 100-pixel gap beyond the boundary.
- Panels must be arranged in a rectangular grid layout to achieve maximum coverage without overlap or partial placement. 

Step 4: JSON Output Format (Without commas or special characters) 
Provide results strictly in the following JSON format:


{
"rooftop_detection": "Yes" or "No"
"max_solar_panels": integer number of panels calculated
"note": "This analysis assumes constant roof dimensions regardless of flatness and represents the maximum possible installation based solely on available area If the roof is not perfectly flat this number is an estimation"
}


Important Reminders and Clarifications:
- Roof measurements are always provided in pixels directly; do NOT multiply by 3779 or perform unit conversions.
- Ensure that the measurements and calculations are realistic. If they seem unrealistic or unclear, explicitly return "rooftop_detection": "No".
- here is the width ${imageW} and height ${imageH} in pixels. If you get 0 then dont do the calcualtion just get the ide on no of solar can be place and in that case the solar size is 1.5 x 1.5 meter.

This revised prompt clearly instructs the model to maintain precision, consistency, and realism in its analysis, significantly improving overall accuracy. 


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
