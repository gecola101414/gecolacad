import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import { Entity, CSGMeshEntity } from '../types';

export const createMeshFromEntity = (entity: any): THREE.Mesh | null => {
  if (!entity) return null;

  if (entity.type === 'bim-csg' && entity.geometryData) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(entity.geometryData.positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(entity.geometryData.normals), 3));
    if (entity.geometryData.uvs && entity.geometryData.uvs.length > 0) {
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(entity.geometryData.uvs), 2));
    }
    if (entity.geometryData.indices && entity.geometryData.indices.length > 0) {
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(entity.geometryData.indices), 1));
    }
    const m = new THREE.Mesh(geo);
    m.updateMatrixWorld(true);
    return m;
  }

  const h = (entity.bimHeight || entity.height || 270) / 100;
  const baseZ = ((entity.bimZPlane || 0) + (entity.bimZElevation || 0)) / 100;
  const points = entity.points || entity.bimPoints;

  // Wall entity with multiple consecutive points
  if (entity.bimType === 'wall' && points && points.length >= 2) {
    const meshes: THREE.Mesh[] = [];
    const width = (entity.bimWidth || entity.width || 15) / 100;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx*dx + dy*dy);
      const angle = Math.atan2(dy, dx);
      
      const centerX = (p1.x + p2.x) / 2;
      const centerY = (p1.y + p2.y) / 2;

      const geom = new THREE.BoxGeometry(length / 100, h, width);
      const mesh = new THREE.Mesh(geom);
      mesh.position.set(centerX / 100, baseZ + h / 2, -centerY / 100);
      mesh.rotation.y = -angle;
      mesh.updateMatrix();
      
      // Bake the matrix transformation into the geometry vertices
      mesh.geometry.applyMatrix4(mesh.matrix);
      // Reset position/rotation to local identity
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.set(1, 1, 1);
      mesh.updateMatrix();
      mesh.updateMatrixWorld(true);

      meshes.push(mesh);
    }

    if (meshes.length === 0) return null;
    if (meshes.length === 1) return meshes[0];

    // Union all segments of the wall into a single mesh
    let unionBsp = CSG.fromMesh(meshes[0]);
    for (let i = 1; i < meshes.length; i++) {
      const bspNext = CSG.fromMesh(meshes[i]);
      unionBsp = unionBsp.union(bspNext);
    }
    return CSG.toMesh(unionBsp, new THREE.Matrix4());
  }

  // Rooms and Walls built from hatch
  if ((entity.bimType === 'room' || entity.type === 'hatch' || entity.bimAreaType === 'muro') && points && points.length >= 3) {
    const s = new THREE.Shape();
    s.moveTo(points[0].x / 100, points[0].y / 100);
    for (let i = 1; i < points.length; i++) {
        s.lineTo(points[i].x / 100, points[i].y / 100);
    }
    s.closePath();
    
    if (entity.holes && entity.holes.length > 0) {
      entity.holes.forEach((holePoints: any) => {
        if (holePoints.length < 3) return;
        const holePath = new THREE.Path();
        holePath.moveTo(holePoints[0].x / 100, holePoints[0].y / 100);
        for (let i = 1; i < holePoints.length; i++) {
          holePath.lineTo(holePoints[i].x / 100, holePoints[i].y / 100);
        }
        holePath.closePath();
        s.holes.push(holePath);
      });
    }

    const geom = new THREE.ExtrudeGeometry(s, { steps: 1, depth: h, bevelEnabled: false });
    const mesh = new THREE.Mesh(geom);
    mesh.position.set(0, baseZ, 0);
    mesh.rotation.x = -Math.PI / 2;
    mesh.updateMatrix();
    
    // Bake the matrix transformation into the geometry vertices
    mesh.geometry.applyMatrix4(mesh.matrix);
    // Reset position/rotation to local identity
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  // Symbol (Door/Window)
  if (entity.bimType === 'door' || entity.bimType === 'window') {
    const p = entity.point || (points && points[0]);
    if (!p) return null;
    const w = (entity.bimWidth || 90) / 100;
    const height = (entity.bimType === 'door' ? h : ((entity.bimWindowHeight || 120) / 100));
    
    const geom = new THREE.BoxGeometry(w, height, 0.1);
    const mesh = new THREE.Mesh(geom);
    mesh.position.set(p.x / 100, baseZ + height / 2, -p.y / 100);
    // Add rotation if it's not simply flat
    if (entity.angle) {
        mesh.rotation.y = -entity.angle * Math.PI / 180;
    }
    mesh.updateMatrix();
    
    // Bake the matrix transformation into the geometry vertices
    mesh.geometry.applyMatrix4(mesh.matrix);
    // Reset position/rotation to local identity
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    return mesh;
  }
  
  return null;
};

export const performCSG = (entityA: Entity, entityB: Entity, operation: 'union' | 'subtract'): CSGMeshEntity | null => {
  const meshA = createMeshFromEntity(entityA);
  const meshB = createMeshFromEntity(entityB);

  if (!meshA || !meshB) return null;

  const bspA = CSG.fromMesh(meshA);
  const bspB = CSG.fromMesh(meshB);

  let resultBsp;
  if (operation === 'union') {
    resultBsp = bspA.union(bspB);
  } else if (operation === 'subtract') {
    resultBsp = bspA.subtract(bspB);
  } else {
    return null;
  }

  const resultMesh = CSG.toMesh(resultBsp, new THREE.Matrix4());
  const geo = resultMesh.geometry as THREE.BufferGeometry;
  
  const positions = Array.from(geo.attributes.position.array);
  const normals = geo.attributes.normal ? Array.from(geo.attributes.normal.array) : [];
  const uvs = geo.attributes.uv ? Array.from(geo.attributes.uv.array) : undefined;
  const indices = geo.index ? Array.from(geo.index.array) : undefined;

  let volume = 0;
  let area = 0;
  if (positions && indices && indices.length > 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const i1 = indices[i] * 3;
      const i2 = indices[i+1] * 3;
      const i3 = indices[i+2] * 3;
      
      const p1x = positions[i1], p1y = positions[i1+1], p1z = positions[i1+2];
      const p2x = positions[i2], p2y = positions[i2+1], p2z = positions[i2+2];
      const p3x = positions[i3], p3y = positions[i3+1], p3z = positions[i3+2];
      
      volume += p1x*p2y*p3z - p1x*p3y*p2z - p2x*p1y*p3z + p2x*p3y*p1z + p3x*p1y*p2z - p3x*p2y*p1z;
      
      const abx = p2x - p1x, aby = p2y - p1y, abz = p2z - p1z;
      const acx = p3x - p1x, acy = p3y - p1y, acz = p3z - p1z;
      
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      
      area += 0.5 * Math.sqrt(crossX*crossX + crossY*crossY + crossZ*crossZ);
    }
    volume = Math.abs(volume / 6.0);
  }

  // Preserve properties
  let baseName = entityA.bimName || 'Unione';
  if (operation === 'subtract' && entityA.bimName) baseName = `Sottrazione da ${entityA.bimName}`;
  const bimType = entityA.bimType || 'room';

  return {
    type: 'bim-csg',
    isBIM: true,
    id: `csg_${Date.now()}_${Math.random().toString(36).substring(2,5)}`,
    layer: entityA.layer, 
    color: entityA.color,
    lineWidth: 1,
    mode: "CAD" as "2H" | "HB" | "CAD",
    bimName: baseName,
    bimType: bimType,
    bimVolume: volume,
    bimArea: area,
    geometryData: {
      positions,
      normals,
      uvs,
      indices
    }
  } as CSGMeshEntity;
};
