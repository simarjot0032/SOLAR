/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini model
const genAI = new GoogleGenerativeAI(
  process.env.NEXT_PUBLIC_GOOGLE_API_KEY || ""
);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("roofImage");

    for (let [key, value] of formData.entries()) {
      console.log("FormData contains:", key, value);
    }

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

    const parsedGridData = JSON.parse(gridData);

    const prompt = `
      Analyze the provided rooftop image to determine suitable areas for solar panel installation. 

      **Image Analysis:**

      1. **Rooftop Detection:** Determine if the image depicts a rooftop.
      2. **Grid Creation:** Divide the rooftop into a grid of 200x200 pixel cells.
      3. **Obstacle Detection:** Identify and locate any obstacles on the rooftop (e.g., railing, building structures, skylights/vents). Represent obstacles using bounding boxes.
      4. **Usable Surface Area Estimation:** For each grid cell, estimate the usable surface area available for solar panels, considering obstacles.
      5. **Potential Solar Panel Zones:** Identify and describe potential zones for solar panel installation based on available space and estimated surface areas.

      **Output:**

      Provide the results in  js object with the following keys:

      - rooftop_detection: "Yes" or "No"
      - grid_data: 
          -  grid_size : "200x200 pixels"
          -  grid_cells : Array of objects with  x  and  y  coordinates for each grid cell.
      -  surface_areas :
          -  note : A note about the limitations of surface area estimation.
          -  grid_cell_areas : Array of objects with  cell_coordinates  (x, y) and  estimated_usable_area  for each grid cell.
      -  potential_solar_panel_areas : Array of objects with  area_description ,  bounding_box  (x1, y1, x2, y2), and  note  for each potential area.
      -  obstacle_coordinates : Array of objects with  obstacle_type  and  bounding_box  (x1, y1, x2, y2) for each obstacle.

      **Assumptions:**

      - The rooftop is generally flat and suitable for solar panels, except for identified obstacles.
      - The black box in the image is an annotation and not a physical obstacle.
      - The goal is to identify potential zones for solar panel installation, not to determine the exact number or placement of individual panels.

      **Note:** This analysis relies on visual interpretation and may not be perfectly accurate. More advanced techniques like 3D modeling or depth information would be needed for precise results.
    `;

    const parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "image/jpeg", // or "image/png"
          data: base64Image,
        },
      },
    ];

    // Send the request to the AI model
    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = JSON.stringify(response);
    console.log("Raw API Response: ", JSON.parse(text));

    // Parse the AI response as JSON
    try {
      const data = JSON.parse(text);
      const output = JSON.stringify(data.candidates[0].content.parts[0].text);
      return NextResponse.json(output);
    } catch (jsonError) {
      console.error("Gemini response is not valid JSON:", response, jsonError);
      return NextResponse.json(
        {
          result: "Gemini response was not valid JSON",
          error: jsonError,
        },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Error in API route:", err);
    return NextResponse.json(
      { result: "Error processing image", err },
      { status: 500 }
    );
  }
}
