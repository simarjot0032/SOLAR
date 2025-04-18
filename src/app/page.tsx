/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import React, { useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Mainlogic from "./components/Mainlogic";
const CONVERSION_FACTOR = 3779; // 1 meter = 100 pixels
const SCALE_FACTOR = 0.5;

const Home: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [roofWidth, setRoofWidth] = useState<string>("");
  const [roofHeight, setRoofHeight] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [apiResponse, setApiResponse] = useState<any>(null);

  // Handle file input change and convert to base64 URL.
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

  // On analyze, convert the base64 URL to a Blob and append required roof dimensions.
  const handleAnalyze = async () => {
    if (!imageSrc) {
      console.error("No image selected.");
      return;
    }
    let widthInMeters: any;
    let heightInMeters: any;
    if (!roofWidth || !roofHeight) {
      console.log("Roof width and height are required.");
      widthInMeters = parseFloat(roofWidth);
      heightInMeters = parseFloat(roofHeight);
    }
    widthInMeters = parseFloat(roofWidth);
    heightInMeters = parseFloat(roofHeight);
    // if (isNaN(widthInMeters) || isNaN(heightInMeters)) {
    //   console.error("Invalid roof dimensions provided.");
    //   return;
    // }
    const roofWidthPixels = widthInMeters * CONVERSION_FACTOR;
    const roofHeightPixels = heightInMeters * CONVERSION_FACTOR;

    try {
      setLoading(true);
      const formData = new FormData();
      // Convert imageSrc (base64 data URL) to Blob.
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      formData.append("roofImage", blob, "roofImage.png");

      // Append converted roof dimensions (in pixels) to the FormData.
      formData.append("roofWidth", roofWidthPixels.toString());
      formData.append("roofHeight", roofHeightPixels.toString());

      // Call your API endpoint.
      const responseAPI = await fetch("/api/pr", {
        method: "POST",
        body: formData,
      });
      if (!responseAPI.ok) {
        console.error("API response was not ok");
        setLoading(false);
        return;
      }
      const data = await responseAPI.json();
      console.log("API Response:", data);
      setApiResponse(data);
      setLoading(false);
      initRoofScene(
        roofWidthPixels,
        roofHeightPixels,
        data.result.max_solar_panels
      );
    } catch (error) {
      console.error("API Error:", error);
      setLoading(false);
    }
  };
  const initRoofScene = (width: number, height: number, maxPanels: number) => {
    const container = document.getElementById("three-canvas");
    if (!container) return;

    // Clear previous content.
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0xffffff);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Set up an orthographic camera with a frustum matching the roof dimensions.
    const left = -width / 2;
    const right = width / 2;
    const top = height / 2;
    const bottom = -height / 2;
    const camera = new THREE.OrthographicCamera(
      left,
      right,
      top,
      bottom,
      1,
      2000
    );

    camera.position.set(1000, 200, 0);
    camera.lookAt(100, 500, 0);
    scene.add(camera);

    const roofGeometry = new THREE.PlaneGeometry(width, height);
    const roofMaterial = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      side: THREE.DoubleSide,
    });
    const roofPlane = new THREE.Mesh(roofGeometry, roofMaterial);
    roofPlane.rotation.x = -Math.PI / 2;
    scene.add(roofPlane);

    const panelWidth = 5669;
    const panelHeight = 5669;
    const gap = 100;

    const columns = Math.floor((width + gap) / (panelWidth + gap));

    const rows = Math.floor((height + gap) / (panelHeight + gap));

    const totalGridWidth = columns * panelWidth + (columns - 1) * gap;
    const totalGridHeight = rows * panelHeight + (rows - 1) * gap;

    const startX = -totalGridWidth / 2 + panelWidth / 2;
    const startZ = totalGridHeight / 2 - panelHeight / 2;

    let panelCount = 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if (panelCount >= maxPanels) break;
        const x = startX + col * (panelWidth + gap);
        const z = startZ - row * (panelHeight + gap);
        const y = 1;
        const panelGeometry = new THREE.PlaneGeometry(panelWidth, panelHeight);

        const panelMaterial = new THREE.MeshBasicMaterial({
          color: 0x1e90ff,
          side: THREE.DoubleSide,
        });
        const panel = new THREE.Mesh(panelGeometry, panelMaterial);
        panel.rotation.x = -Math.PI / 2;
        panel.position.set(x, y, z);
        scene.add(panel);
        panelCount++;
      }

      if (panelCount >= maxPanels) break;
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enablePan = true;

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  };

  return (
    // <div style={{ padding: 20 }}>
    //   <h2>Roof Analysis</h2>
    //   <input type="file" onChange={handleFileChange} />
    //   <div style={{ marginTop: 10 }}>
    //     <label>
    //       Roof Width (meters):{" "}
    //       <input
    //         type="text"
    //         value={roofWidth}
    //         onChange={(e) => setRoofWidth(e.target.value)}
    //         required
    //       />
    //     </label>
    //   </div>
    //   <div style={{ marginTop: 10 }}>
    //     <label>
    //       Roof Height (meters):{" "}
    //       <input
    //         type="text"
    //         value={roofHeight}
    //         onChange={(e) => setRoofHeight(e.target.value)}
    //         required
    //       />
    //     </label>
    //   </div>
    //   <button onClick={handleAnalyze} style={{ marginTop: 20 }}>
    //     {loading ? "Loading..." : "Analyze"}
    //   </button>

    //   {imageSrc && (
    //     <div style={{ marginTop: 20 }}>
    //       <h3>Original Image</h3>
    //       <img
    //         src={imageSrc}
    //         alt="Original Roof"
    //         style={{ maxWidth: "100%" }}
    //       />
    //     </div>
    //   )}

    //   {apiResponse && (
    //     <div style={{ marginTop: 20 }}>
    //       {apiResponse.result && (
    //         <h2>Maximum Solar Panels: {apiResponse.result.max_solar_panels}</h2>
    //       )}
    //     </div>
    //   )}
    //   <div
    //     id="three-canvas"
    //     style={{
    //       width: "100%",
    //       height: "600px",
    //       border: "1px solid #ccc",
    //       marginTop: 20,
    //     }}
    //   />
    // </div>
    <>
      <Mainlogic />
    </>
  );
};

export default Home;
