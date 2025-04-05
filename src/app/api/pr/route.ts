/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Initialize Gemini model
const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("roofImage");
    const imageH = formData.get("imageHeight");
    const imageW = formData.get("imageWidth");

    // Check if the file is not received or not a valid Blob
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ result: "No file received" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");

    const gridData = formData.get("gridData");
    if (!gridData || typeof gridData !== "string") {
      return NextResponse.json(
        { result: "No grid data received" },
        { status: 400 }
      );
    }

    // Prompt to the Gemini model
    const prompt = `
Analyze the provided rooftop image to determine suitable areas for solar panel installation, maximizing the potential solar panel coverage.

**Image Analysis:**

1. **Rooftop Detection:** Determine if the image depicts a rooftop.
2. **Grid Creation:** Divide the rooftop into a grid of 200x200 pixel cells.
3. **Obstacle Detection:** Identify and locate any obstacles on the rooftop (e.g., railing, building structures, skylights/vents). Represent obstacles using bounding boxes.
4. **Usable Surface Area Estimation:** For each grid cell, estimate the usable surface area available for solar panels, considering obstacles, and aiming to maximize the usable surface.
5. **Potential Solar Panel Zones:** Identify and describe potential zones for solar panel installation based on available space and estimated surface areas, prioritizing maximum coverage.

**Output:**
Provide the results in JSON format without any special character like comma etc, with the following keys:

- rooftop_detection: "Yes" or "No"
- grid_data: 
    -  grid_size : "200x200 pixels"
    -  grid_cells : Array of objects with x and y coordinates for each grid cell.
- surface_areas :
    -  note : A note about the limitations of surface area estimation, and that the goal is to maximize the usable surface for solar panels.
    -  grid_cell_areas : Array of objects with cell_coordinates (x, y) and estimated_usable_area for each grid cell.
- potential_solar_panel_areas : Array of objects with area_description, bounding_box (x1, y1, x2, y2), and note for each potential area, with a focus on maximizing solar panel placement.
- obstacle_coordinates : Array of objects with obstacle_type and bounding_box (x1, y1, x2, y2) for each obstacle.

**Assumptions:**
- The rooftop is generally flat and suitable for solar panels, except for identified obstacles.
- The black box in the image is an annotation and not a physical obstacle.
- The goal is to identify potential zones for solar panel installation, aiming to maximize the area covered by solar panels, not to determine the exact number or placement of individual panels.

**Note:** This analysis relies on visual interpretation and may not be perfectly accurate. More advanced techniques like 3D modeling or depth information would be needed for precise results. If you didn't think that we can place any solar in image just return NO in rooftop_detection.
- There can be multiple obstacles and multiple solar panels.
- The analysis should prioritize maximizing the placement of solar panels, working around obstacles to achieve the highest possible coverage.
`;

    const parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "image/jpg",
          data: base64Image,
        },
      },
    ];

    const result: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: parts,
    });

    // Access the response
    if (result.candidates && result.candidates[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.text) {
          try {
            // Remove code block markers
            let cleanText = part.text
              .replace("```json", "")
              .replace("```", "")
              .trim();
            const parsedResponse = JSON.parse(cleanText); // Parse the JSON response
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
