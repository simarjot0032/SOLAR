/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import React, { useState } from "react";
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
  const [gridData, setGridData] = useState<any[]>([]); // For API request if needed
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [panelAreas, setPanelAreas] = useState<PanelArea[]>([]);
  const [potentialPanelAreas, setPotentialPanelAreas] = useState<any[]>([]);

  // Handle file input change and load the image data as a base64 string.
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

  // Simulate sending the image and grid data to your API and process its response.
  const handleAnalyze = async (gridData: any[]) => {
    if (!imageSrc) {
      console.error("No image selected.");
      return;
    }

    const formData = new FormData();
    try {
      // Fetch the image from the base64 data URL and append it to form data.
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      formData.append("roofImage", blob, "roofImage.png");
      formData.append("gridData", JSON.stringify(gridData));

      // Get the image dimensions.
      const img = new Image();
      img.src = imageSrc;
      img.onload = async () => {
        const imgWidth = img.width;
        const imgHeight = img.height;
        formData.append("imageWidth", imgWidth.toString());
        formData.append("imageHeight", imgHeight.toString());

        // Replace "/api/pr" with your API endpoint.
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
        console.log("API Response:", data);

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

  // Initialize Three.js scene with the image, solar panels (black boxes),
  // and potential solar panel areas (green boxes).
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

    // Clear any previous content.
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Create the scene.
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    // Use an Orthographic camera for a top-down view.
    const camera = new THREE.OrthographicCamera(
      -imgWidth / 2, // left
      imgWidth / 2, // right
      imgHeight / 2, // top
      -imgHeight / 2, // bottom
      1, // near
      2000 // far
    );
    camera.position.set(0, 200, 0); // Position high above the plane.
    camera.lookAt(0, 0, 0);

    // Renderer setup.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Ambient light.
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      imageSrc,
      (texture) => {
        // Create a plane geometry for the rooftop image.
        const planeGeometry = new THREE.PlaneGeometry(imgWidth, imgHeight);
        const planeMaterial = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        // Rotate the plane so it lies flat on the X-Z plane.
        plane.rotation.x = -Math.PI / 2;
        scene.add(plane);

        // Parse grid size from the API response.
        const gridSize = gridData.grid_size || "200x200 pixels";
        const [gridWidthStr, gridHeightStr] = gridSize
          .replace(" pixels", "")
          .split("x");
        const gridWidth = parseInt(gridWidthStr.trim(), 10);
        const gridHeight = parseInt(gridHeightStr.trim(), 10);

        // Create solar panel geometry (black boxes).
        // Adjust size as needed relative to your image dimensions.
        const solarPanelGeometry = new THREE.BoxGeometry(20, 1, 20);
        const solarPanelMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000,
        });

        // Place each solar panel based on the grid cell coordinates.
        panelAreas.forEach((area: PanelArea) => {
          const { cell_coordinates } = area;
          // Convert the AI's grid coordinates to image pixel coordinates.
          const centerX = (cell_coordinates.x / gridWidth) * imgWidth;
          const centerZ = (cell_coordinates.y / gridHeight) * imgHeight;
          // Shift so that the image's center is at (0,0) in the scene.
          const xPos = centerX - imgWidth / 2;
          const zPos = centerZ - imgHeight / 2;

          // Check if this cell is blocked by any obstacles (using original image coords).
          const isBlocked = obstacles.some((obstacle) => {
            const [x1, y1, x2, y2] = obstacle.boundingBox || [];
            if (!x1 || !y1 || !x2 || !y2) return false;
            return (
              centerX >= x1 && centerX <= x2 && centerZ >= y1 && centerZ <= y2
            );
          });

          if (!isBlocked) {
            const panelMesh = new THREE.Mesh(
              solarPanelGeometry,
              solarPanelMaterial
            );
            // Position the panel slightly above the plane.
            panelMesh.position.set(xPos, 0.5, zPos);
            scene.add(panelMesh);
          }
        });

        // Draw potential solar panel areas (green boxes).
        potentialPanelAreas.forEach((area: any) => {
          const boundingBox = area?.bounding_box || {};
          const { x1, y1, x2, y2 } = boundingBox;
          if ([x1, y1, x2, y2].some((val) => val === undefined)) return;

          // Calculate width and height (depth) of the bounding box in image pixels.
          const width = x2 - x1;
          const depth = y2 - y1;
          const boxGeometry = new THREE.BoxGeometry(width, 1, depth);
          const boxMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.4,
          });
          const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);

          // Calculate the center of the bounding box.
          const centerX_box = x1 + width / 2;
          const centerY_box = y1 + depth / 2;
          // Convert image coordinates to Three.js coordinates.
          const xPos_box = centerX_box - imgWidth / 2;
          const zPos_box = centerY_box - imgHeight / 2;
          boxMesh.position.set(xPos_box, 0.6, zPos_box);
          scene.add(boxMesh);
        });
      },
      undefined,
      (err) => console.error("Failed to load image texture", err)
    );

    // Render loop.
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
      <button
        onClick={() => handleAnalyze(gridData)}
        style={{ marginLeft: 10 }}
      >
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
