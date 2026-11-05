import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IFCLoader } from 'web-ifc-three/IFCLoader';

interface BasicIFCViewerProps {
  file: File | null;
}

export const BasicIFCViewer: React.FC<BasicIFCViewerProps> = ({ file }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !file) return;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f0f0f0');

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(10, 10, 10);

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    // 4. Lights
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // 6. IFCLoader Initialization
    const ifcLoader = new IFCLoader();
    ifcLoader.ifcManager.setWasmPath('https://unpkg.com/web-ifc@0.0.77/'); // Assicurarsi che combaci con la versione installata

    let animationFrameId: number;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    // 7. Load File
    const loadFile = async () => {
      setLoading(true);
      try {
        let text = await file.text();
        
        // Fix truncated IFC if necessary
        if (!text.includes('ENDSEC;')) {
          text += '\nENDSEC;';
        }
        if (!text.includes('END-ISO-10303-21;')) {
          text += '\nEND-ISO-10303-21;';
        }

        const blob = new Blob([text], { type: 'application/octet-stream' });
        const objectUrl = URL.createObjectURL(blob);
        
        ifcLoader.load(objectUrl, (ifcModel) => {
          scene.add(ifcModel);
          
          // Auto-center the camera and controls
          const box = new THREE.Box3().setFromObject(ifcModel);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const fov = camera.fov * (Math.PI / 180);
          let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));
          cameraZ *= 1.5; // Zoom out slightly
          
          camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
          controls.target.copy(center);
          controls.update();
          
          setLoading(false);
          URL.revokeObjectURL(objectUrl);
        }, undefined, (err) => {
           console.error("Error inside IFCLoader:", err);
           setLoading(false);
        });
      } catch (err) {
        console.error("Errore nel caricamento del file IFC:", err);
        setLoading(false);
      }
    };

    loadFile();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [file]);

  if (!file) return null;

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
          <span className="text-sm font-bold text-slate-700">Caricamento Modello 3D in corso...</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full border border-slate-300 rounded" />
    </div>
  );
};
