/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

interface Obstacle {
  x: number;
  y: number;
  boundingBox: number[];
}

interface PanelArea {
  cell_coordinates: { x: number; y: number };
  estimated_usable_area: string;
}

const Home: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [gridData, setGridData] = useState<any[]>([]); // To store grid coordinates for API request
  const [obstacles, setObstacles] = useState<Obstacle[]>([]); // Obstacle data
  const [panelAreas, setPanelAreas] = useState<PanelArea[]>([]); // Panel areas from AI
  const [potentialPanelAreas, setPotentialPanelAreas] = useState<any[]>([]); // Potential solar panel areas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  const handleAnalyze = async (gridData: any[]) => {
    if (!imageSrc) {
      console.error("No image selected.");
      return;
    }

    const formData = new FormData();
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      formData.append("roofImage", blob, "roofImage.png");
      formData.append("gridData", JSON.stringify(gridData));

      // Get the image dimensions
      const img = new Image();
      img.src = imageSrc;
      img.onload = async () => {
        const imgWidth = img.width;
        const imgHeight = img.height;

        // Pass the image width and height to the AI model in the request
        formData.append("imageWidth", imgWidth.toString());
        formData.append("imageHeight", imgHeight.toString());

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
        console.log("API Response:", data); // Log the entire response for debugging

        if (data.rooftop_detection === "Yes") {
          const panelAreas = Array.isArray(data.surface_areas?.grid_cell_areas)
            ? data.surface_areas.grid_cell_areas
            : [];
          const potentialPanelAreas = Array.isArray(
            data.potential_solar_panel_areas
          )
            ? data.potential_solar_panel_areas
            : [];
          const obstacles = Array.isArray(data.obstacle_coordinates)
            ? data.obstacle_coordinates
            : [];

          setPanelAreas(panelAreas);
          setObstacles(obstacles);
          setPotentialPanelAreas(potentialPanelAreas);

          if (panelAreas.length > 0) {
            initThreeScene(
              panelAreas,
              obstacles,
              potentialPanelAreas,
              imgWidth,
              imgHeight,
              data.grid_data
            );
          } else {
            console.error("No valid panel areas received from the API.");
          }
        } else {
          console.error("Not a rooftop image.");
        }
      };
    } catch (error) {
      console.error("API Error:", error);
    }
  };

  const initThreeScene = (
    panelAreas: PanelArea[],
    obstacles: Obstacle[],
    potentialPanelAreas: any[],
    imgWidth: number,
    imgHeight: number,
    gridData: any
  ) => {
    const container = document.getElementById("three-container");
    if (!container || !imageSrc) return;

    // Clear previous objects in the scene to avoid duplication
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const scene = new THREE.Scene();

    // Set the background color of the scene
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background

    // Adjusting the camera for a proper 3D view
    const camera = new THREE.PerspectiveCamera(
      75, // Field of view for better perspective
      container.clientWidth / container.clientHeight, // Aspect ratio
      0.1, // Near clipping plane
      1000 // Far clipping plane (adjusted for better scene depth)
    );

    // Adjust camera position to frame the scene better
    camera.position.set(0, 150, 400); // Move the camera further back or adjust based on the scene
    camera.lookAt(0, 0, 0); // Ensure the camera looks at the center of the scene

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      imageSrc,
      (texture) => {
        const geometry = new THREE.PlaneGeometry(imgWidth, imgHeight);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
        });
        const plane = new THREE.Mesh(geometry, material);

        plane.rotation.set(0, 0, 0); // Set the plane to be aligned
        scene.add(plane);

        // Add solar panels and potential panel areas, assuming no multiple image textures
        const solarPanelGeometry = new THREE.BoxGeometry(50, 10, 10); // Adjust size of the panels
        const solarPanelMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000, // Color for solar panels
        });

        // Scaling and positioning solar panels based on AI grid data
        const gridSize = gridData.grid_size || "200x200 pixels"; // Use grid size from AI response
        console.log(gridSize);
        const [gridWidth, gridHeight] = gridSize.split("x").map(Number);

        panelAreas.forEach((area: PanelArea) => {
          const { cell_coordinates } = area;

          // Log the cell coordinates to debug
          console.log("Panel Area Coordinates:", cell_coordinates);

          const centerX = (cell_coordinates.x / gridWidth) * imgWidth;
          const centerZ = (cell_coordinates.y / gridHeight) * imgHeight;

          // Log the calculated center values to debug
          console.log("Placing Solar Panel at:", { centerX, centerZ });

          // Check if the centerZ value is valid (not NaN)
          if (isNaN(centerZ) || isNaN(centerX)) {
            console.error("Invalid center coordinates:", { centerX, centerZ });
            return; // Skip invalid panels
          }

          const isBlocked = obstacles.some((obstacle) => {
            const [x1, y1, x2, y2] = obstacle.boundingBox || [];
            if (!x1 || !y1 || !x2 || !y2) return false;

            return (
              centerX >= x1 && centerX <= x2 && centerZ >= y1 && centerZ <= y2
            );
          });

          if (!isBlocked) {
            const solarPanel = new THREE.Mesh(
              solarPanelGeometry,
              solarPanelMaterial
            );
            solarPanel.position.set(centerX, 10, centerZ); // Adjust positioning based on grid
            scene.add(solarPanel);
          }
        });

        // Visualizing potential panel areas for solar installation
        potentialPanelAreas.forEach((area) => {
          const boundingBox = area?.bounding_box || {};
          if (
            boundingBox.x1 !== undefined &&
            boundingBox.x2 !== undefined &&
            boundingBox.y1 !== undefined &&
            boundingBox.y2 !== undefined
          ) {
            const { x1, y1, x2, y2 } = boundingBox;

            const panelAreaGeometry = new THREE.BoxGeometry(
              x2 - x1, // Width based on bounding box
              1, // Flat height
              y2 - y1 // Depth based on bounding box
            );

            const panelAreaMaterial = new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              transparent: true,
              opacity: 0.3,
            });

            const panelArea = new THREE.Mesh(
              panelAreaGeometry,
              panelAreaMaterial
            );
            panelArea.position.set((x1 + x2) / 2, 0, (y1 + y2) / 2);
            scene.add(panelArea);
          } else {
            console.error(
              "Invalid bounding box for potential panel area:",
              area
            );
          }
        });
      },
      undefined,
      (err) => console.error("Failed to load image texture", err)
    );

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    animate();
  };

  return (
    <div style={{ padding: 20 }}>
      <input type="file" onChange={handleFileChange} />
      <button onClick={() => handleAnalyze(gridData)}>Analyze</button>
      <div
        id="three-container"
        style={{
          width: "100%",
          height: "500px",
          border: "1px solid #ccc",
          marginTop: 20,
        }}
      />
    </div>
  );
};

export default Home;
