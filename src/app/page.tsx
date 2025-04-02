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
  const [gridSize, setGridSize] = useState<number>(200);
  const [gridData, setGridData] = useState<any[]>([]); // To store grid coordinates for API request
  const [obstacles, setObstacles] = useState<Obstacle[]>([]); // Obstacle data
  const [panelAreas, setPanelAreas] = useState<PanelArea[]>([]); // Panel areas from AI
  const [potentialPanelAreas, setPotentialPanelAreas] = useState<any[]>([]); // Potential solar panel areas
  const [isGridDrawn, setIsGridDrawn] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result && typeof ev.target.result === "string") {
        setImageSrc(ev.target.result);
        setIsGridDrawn(false); // Reset grid when new image is uploaded
      }
    };
    reader.readAsDataURL(file);
  };

  const drawInvisibleGrid = () => {
    if (!canvasRef.current || !imageSrc) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const gridData = [];
      const numRows = Math.floor(height / gridSize);
      const numCols = Math.floor(width / gridSize);

      for (let row = 0; row < numRows; row++) {
        for (let col = 0; col < numCols; col++) {
          const x = col * gridSize;
          const y = row * gridSize;
          gridData.push({ x, y, width: gridSize, height: gridSize });
        }
      }

      setGridData(gridData);
      setIsGridDrawn(true);

      // Send grid data to the backend for processing
      handleAnalyze(gridData);
    };
  };

  const handleAnalyze = async (gridData: any[]) => {
    if (!gridData.length) {
      alert("No grid to analyze!");
      return;
    }

    if (!imageSrc) {
      console.error("No image selected.");
      return;
    }

    const formData = new FormData();
    try {
      // Convert imageSrc (base64) to Blob to send as a file
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      formData.append("roofImage", blob, "roofImage.png"); // Append file to FormData
      formData.append("gridData", JSON.stringify(gridData));
      formData.append("gridSize", gridSize.toString());

      // Send the form data to the API
      const responseAPI = await fetch("/api/pr", {
        method: "POST",
        body: formData,
      });

      if (!responseAPI.ok) {
        console.error("API response was not ok");
        return;
      }

      const data = await responseAPI.json();
      console.log("API Response: ", data);

      if (data.rooftop_detection === "Yes") {
        const panelAreas = data.surface_areas.grid_cell_areas || []; // Get surface areas
        const potentialPanelAreas = data.potential_solar_panel_areas || []; // Get potential panel areas
        const obstacles = data.obstacle_coordinates || []; // Get obstacles
        setPanelAreas(panelAreas);
        setObstacles(obstacles);
        setPotentialPanelAreas(potentialPanelAreas);

        if (panelAreas.length > 0) {
          initThreeScene(panelAreas, obstacles, potentialPanelAreas);
        } else {
          console.error("No valid panel areas received from the API.");
        }
      } else {
        console.error("Not a rooftop image.");
      }
    } catch (error) {
      console.error("API Error:", error);
    }
  };

  const initThreeScene = (
    panelAreas: PanelArea[],
    obstacles: Obstacle[],
    potentialPanelAreas: any[]
  ) => {
    const container = document.getElementById("three-container");
    if (!container || !imageSrc) return;

    // Clear previous
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const scene = new THREE.Scene();

    // Adjusting the camera for a proper 3D view
    const camera = new THREE.PerspectiveCamera(
      75, // Field of view for better perspective
      container.clientWidth / container.clientHeight, // Aspect ratio
      0.1, // Near clipping plane
      2000 // Far clipping plane
    );

    camera.position.set(0, 200, 500); // Move the camera away
    camera.lookAt(0, 0, 0); // Look at the center of the scene

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      imageSrc,
      (texture) => {
        const imgWidth = texture.image.width;
        const imgHeight = texture.image.height;
        const planeWidth = 600;
        const planeHeight = (imgHeight / imgWidth) * planeWidth;

        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
        });
        const plane = new THREE.Mesh(geometry, material);

        plane.rotation.set(0, 0, 0); // Set the plane to be aligned

        scene.add(plane);

        const solarPanelGeometry = new THREE.BoxGeometry(50, 10, 10);
        const solarPanelMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000,
        });

        panelAreas.forEach((area: PanelArea) => {
          const { cell_coordinates } = area;

          const centerX = cell_coordinates.x + gridSize / 2;
          const centerZ = cell_coordinates.y + gridSize / 2;

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
            solarPanel.position.set(centerX, 10, centerZ); // Set the position of the panel
            scene.add(solarPanel);
          }
        });

        // Visualizing potential panel areas for solar installation
        potentialPanelAreas.forEach((area) => {
          const [x1, y1, x2, y2] = area.bounding_box;
          const panelAreaGeometry = new THREE.BoxGeometry(
            x2 - x1,
            1, // Height of the area (flat)
            y2 - y1
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
      <button onClick={drawInvisibleGrid}>Analyze</button>
      <div
        id="three-container"
        style={{
          width: "100%",
          height: "500px",
          border: "1px solid #ccc",
          marginTop: 20,
        }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
};

export default Home;
