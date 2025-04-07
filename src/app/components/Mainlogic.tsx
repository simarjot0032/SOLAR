/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
"use client";
import React, { ChangeEvent, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import "../styles/index.scss";

const CONVERSION_FACTOR = 3779; // 1 meter = 3779 pixels

export default function Mainlogic() {
  const [imageURL, setImageURL] = useState<string>(""); // For preview
  const [imageFile, setImageFile] = useState<File | null>(null); // For upload
  const [roofWidth, setRoofWidth] = useState<string>("");
  const [roofHeight, setRoofHeight] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [apiResponse, setApiResponse] = useState<any>(null);

  const handleImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file); // Store actual file
      setImageURL(URL.createObjectURL(file)); // Create preview URL
    }
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      console.error("No image selected.");
      return;
    }
    if (!roofWidth || !roofHeight) {
      console.error("Roof width and height are required.");
      return;
    }

    const widthInMeters = parseFloat(roofWidth);
    const heightInMeters = parseFloat(roofHeight);
    const roofWidthPixels = widthInMeters * CONVERSION_FACTOR;
    const roofHeightPixels = heightInMeters * CONVERSION_FACTOR;

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("roofImage", imageFile, "roofImage.png");
      formData.append("roofWidth", roofWidthPixels.toString());
      formData.append("roofHeight", roofHeightPixels.toString());

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

      // Call the three.js scene initializer using the result from the API.
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

    // Adjust camera position and orientation as needed.
    camera.position.set(1000, 200, 0);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    // Create roof plane.
    const roofGeometry = new THREE.PlaneGeometry(width, height);
    const roofMaterial = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      side: THREE.DoubleSide,
    });
    const roofPlane = new THREE.Mesh(roofGeometry, roofMaterial);
    roofPlane.rotation.x = -Math.PI / 2;
    scene.add(roofPlane);

    // Define solar panel dimensions (in pixels) and gap.
    const panelWidth = 5669;
    const panelHeight = 5669;
    const gap = 100;

    // Calculate grid dimensions.
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
        const y = 1; // Slightly above the roof plane
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

    // Set up OrbitControls.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enablePan = true;

    // Render loop.
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
  };

  return (
    <>
      <div className="navbar-container">
        <h2 className="navbar-heading">Roof Top Analyzer</h2>
      </div>
      <div className="parent-container">
        <h1 className="roof-top-content-heading">Roof Top Solar Planner</h1>
        <div className="load-image-container">
          {imageURL && (
            <img
              src={imageURL}
              alt="Uploaded Roof"
              className="user-roof-image"
            />
          )}
          {!imageURL && (
            <h2 className="user-image-upload-message">
              Please Select an Image for Analyzing
            </h2>
          )}
          <div className="user-upload-button">
            <label htmlFor="user-roof">Upload File</label>
            <input
              type="file"
              id="user-roof"
              disabled={!!imageURL}
              onChange={handleImage}
              style={{ display: "none" }}
            />
          </div>
          {!imageURL && (
            <p className="image-warning-message">
              Please Upload in .png format
            </p>
          )}
          <div className="dimension-inputs">
            <div>
              <p className="dimension-heading">Roof width (m)</p>
              <input
                type="number"
                placeholder="Width (m)"
                value={roofWidth}
                onChange={(e) => setRoofWidth(e.target.value)}
              />
            </div>
            <div>
              <p className="dimension-heading">Roof height (m)</p>
              <input
                type="number"
                placeholder="Height (m)"
                value={roofHeight}
                onChange={(e) => setRoofHeight(e.target.value)}
              />
            </div>
          </div>
          <button
            className="analyze-button"
            disabled={loading || !imageFile || !roofWidth || !roofHeight}
            onClick={handleAnalyze}
          >
            {loading ? "Analyzing..." : "Analyze Roof"}
          </button>
        </div>
        {/* The three.js container */}
        <div
          id="three-canvas"
          style={{ width: "100%", height: "500px", marginTop: "20px" }}
        ></div>
      </div>
    </>
  );
}
