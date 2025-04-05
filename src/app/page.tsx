/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import React, { useState } from "react";
import * as THREE from "three";

interface Obstacle {
  boundingBox: number[];
}

interface PanelArea {
  cell_coordinates: { x: number; y: number }; // grid coordinates (cell indices)
  estimated_usable_area: string;
}

interface GridData {
  grid_size: string; // e.g., "200x200 pixels"
  grid_cells: Array<{ x: number; y: number }>;
}

const Home: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [panelAreas, setPanelAreas] = useState<PanelArea[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [potentialPanelAreas, setPotentialPanelAreas] = useState<any[]>([]);

  // Load the image from a file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result && typeof ev.target.result === "string") {
        setImageSrc(ev.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Send image & gridData to API and parse AI response
  const handleAnalyze = async () => {
    if (!imageSrc) {
      console.error("No image selected.");
      return;
    }
    try {
      const formData = new FormData();
      // Convert base64 data URL to Blob
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      formData.append("roofImage", blob, "roofImage.png");

      // For example purposes, we send an empty gridData (or you could pre-fill one)
      formData.append("gridData", JSON.stringify({}));

      // Also pass image dimensions for the AI (if needed)
      const img = new Image();
      img.src = imageSrc;
      img.onload = async () => {
        const imgWidth = img.width;
        const imgHeight = img.height;
        formData.append("imageWidth", String(imgWidth));
        formData.append("imageHeight", String(imgHeight));

        // Call your API endpoint
        const responseAPI = await fetch("/api/pr", {
          method: "POST",
          body: formData,
        });
        if (!responseAPI.ok) {
          console.error("API response was not ok");
          return;
        }
        const dataOG = await responseAPI.json();
        const data = dataOG.result;
        console.log("AI Response:", data);

        // Assume AI response contains grid_data, surface_areas, potential_solar_panel_areas, and obstacles
        if (data.rooftop_detection === "Yes") {
          const panelAreas = Array.isArray(data.surface_areas?.grid_cell_areas)
            ? data.surface_areas.grid_cell_areas
            : [];
          const potentialAreas = Array.isArray(data.potential_solar_panel_areas)
            ? data.potential_solar_panel_areas
            : [];
          const obstaclesArr = Array.isArray(data.obstacle_coordinates)
            ? data.obstacle_coordinates
            : [];
          const gridDataFromAI = data.grid_data;

          setPanelAreas(panelAreas);
          setObstacles(obstaclesArr);
          setPotentialPanelAreas(potentialAreas);
          setGridData(gridDataFromAI);

          // Initialize Three.js scene using the grid data from AI
          initThreeScene(
            panelAreas,
            obstaclesArr,
            potentialAreas,
            imgWidth,
            imgHeight,
            gridDataFromAI
          );
        } else {
          console.error("Not a rooftop image or no suitable area found.");
        }
      };
    } catch (error) {
      console.error("API Error:", error);
    }
  };

  // Build the Three.js scene
  const initThreeScene = (
    panelAreas: PanelArea[],
    obstacles: Obstacle[],
    potentialAreas: any[],
    imgWidth: number,
    imgHeight: number,
    gridData: GridData
  ) => {
    const container = document.getElementById("three-container");
    if (!container || !imageSrc) return;

    // Clear previous scene
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Create scene and renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Create an orthographic camera to fit the image plane
    const aspect = container.clientWidth / container.clientHeight;
    const imageAspect = imgWidth / imgHeight;
    let left, right, top, bottom;
    if (aspect >= imageAspect) {
      const scale = imgHeight / 2;
      top = scale;
      bottom = -scale;
      left = -scale * aspect;
      right = scale * aspect;
    } else {
      const scale = imgWidth / 2;
      left = -scale;
      right = scale;
      top = scale / aspect;
      bottom = -scale / aspect;
    }
    const camera = new THREE.OrthographicCamera(
      left,
      right,
      top,
      bottom,
      1,
      2000
    );
    camera.position.set(0, 200, 0);
    camera.lookAt(0, 0, 0);

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // Load the rooftop image as a texture on a plane
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      imageSrc,
      (texture) => {
        const planeGeometry = new THREE.PlaneGeometry(imgWidth, imgHeight);
        const planeMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        scene.add(plane);

        // --- Use Grid Data to place solar panels ---
        // Parse grid size from gridData
        // For example, gridData.grid_size could be "200x200 pixels" meaning the grid
        // has cells of that size in the original image.
        const gridSizeStr = gridData.grid_size || "200x200 pixels";
        const [cellWidthStr, cellHeightStr] = gridSizeStr
          .replace(" pixels", "")
          .split("x");
        const cellWidthPixels = parseInt(cellWidthStr.trim(), 10);
        const cellHeightPixels = parseInt(cellHeightStr.trim(), 10);

        // Calculate how many grid cells across and down the image
        const columns = Math.floor(imgWidth / cellWidthPixels);
        const rows = Math.floor(imgHeight / cellHeightPixels);

        // For each panel area, use its grid coordinates to compute a position.
        // Assume cell_coordinates.x and cell_coordinates.y are grid indices (0-indexed).
        const solarPanelGeometry = new THREE.BoxGeometry(
          cellWidthPixels * 0.8,
          1,
          cellHeightPixels * 0.8
        );
        const solarPanelMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000,
        });

        panelAreas.forEach((area) => {
          const { cell_coordinates } = area;
          // Calculate the center of the cell in image pixel space:
          const centerX = (cell_coordinates.x + 0.5) * cellWidthPixels;
          const centerZ = (cell_coordinates.y + 0.5) * cellHeightPixels;

          // Shift coordinates so that (0,0) is the center of the plane
          const xPos = centerX - imgWidth / 2;
          const zPos = centerZ - imgHeight / 2;

          // Optionally, check if this cell is blocked by an obstacle
          const isBlocked = obstacles.some((obs) => {
            const [x1, y1, x2, y2] = obs.boundingBox || [];
            return (
              centerX >= x1 && centerX <= x2 && centerZ >= y1 && centerZ <= y2
            );
          });
          if (!isBlocked) {
            const panelMesh = new THREE.Mesh(
              solarPanelGeometry,
              solarPanelMaterial
            );
            panelMesh.position.set(xPos, 0.5, zPos);
            scene.add(panelMesh);
          }
        });

        // Place green boxes for potential solar panel areas as before.
        potentialAreas.forEach((area) => {
          const boundingBox = area?.bounding_box || {};
          const { x1, y1, x2, y2 } = boundingBox;
          if ([x1, y1, x2, y2].some((val) => val === undefined)) return;
          const width = x2 - x1;
          const depth = y2 - y1;
          const boxGeometry = new THREE.BoxGeometry(width, 1, depth);
          const boxMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.4,
          });
          const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
          const centerX_box = x1 + width / 2;
          const centerZ_box = y1 + depth / 2;
          const xPos_box = centerX_box - imgWidth / 2;
          const zPos_box = centerZ_box - imgHeight / 2;
          boxMesh.position.set(xPos_box, 0.6, zPos_box);
          scene.add(boxMesh);
        });
      },
      undefined,
      (err) => console.error("Failed to load image texture", err)
    );

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Rooftop Solar Panel Analysis</h2>
      <input type="file" onChange={handleFileChange} />
      <button onClick={handleAnalyze} style={{ marginLeft: 10 }}>
        Analyze
      </button>
      <div
        id="three-container"
        style={{
          width: "100%",
          height: "600px",
          border: "1px solid #ccc",
          marginTop: 20,
        }}
      />
    </div>
  );
};

export default Home;
