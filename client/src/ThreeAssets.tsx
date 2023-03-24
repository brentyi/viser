import { extend } from "@react-three/fiber";
import {
  MeshLineGeometry as MeshLine,
  MeshLineMaterial,
  raycast as MeshLineRaycast,
} from "meshline";
import React from "react";
import * as THREE from "three";

extend({ MeshLine, MeshLineMaterial });

const axis_geom = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 16, 1);
const x_material = new THREE.MeshBasicMaterial({ color: 0xcc0000 });
const y_material = new THREE.MeshBasicMaterial({ color: 0x00cc00 });
const z_material = new THREE.MeshBasicMaterial({ color: 0x0000cc });

const origin_geom = new THREE.SphereGeometry(0.1);
const origin_material = new THREE.MeshBasicMaterial({ color: 0xecec00 });

interface CoordinateFrameProps {
  scale?: number;
  quaternion?: THREE.Quaternion;
  position?: THREE.Vector3;
  show_axes?: boolean;
}

/** Helper for adding coordinate frames as scene nodes. */
export const CoordinateFrame = React.forwardRef<
  THREE.Group,
  CoordinateFrameProps
>(
  (
    {
      scale = 0.5,
      quaternion = undefined,
      position = undefined,
      show_axes = true,
    }: CoordinateFrameProps,
    ref
  ) => {
    return (
      <group ref={ref} quaternion={quaternion} position={position}>
        {show_axes && (
          <>
            <mesh
              geometry={origin_geom}
              material={origin_material}
              scale={new THREE.Vector3(scale, scale, scale)}
            />
            <mesh
              geometry={axis_geom}
              rotation={new THREE.Euler(0.0, 0.0, (3.0 * Math.PI) / 2.0)}
              position={[0.5 * scale, 0.0, 0.0]}
              scale={new THREE.Vector3(scale, scale, scale)}
              material={x_material}
            />
            <mesh
              geometry={axis_geom}
              position={[0.0, 0.5 * scale, 0.0]}
              scale={new THREE.Vector3(scale, scale, scale)}
              material={y_material}
            />
            <mesh
              geometry={axis_geom}
              rotation={new THREE.Euler(Math.PI / 2.0, 0.0, 0.0)}
              position={[0.0, 0.0, 0.5 * scale]}
              scale={new THREE.Vector3(scale, scale, scale)}
              material={z_material}
            />
          </>
        )}
      </group>
    );
  }
);

// Camera frustum helper. We jitter to prevent z-fighting for overlapping lines.
const jitter = () => Math.random() * 1e-5;
const frustum_points: number[] = [];
frustum_points.push(0, 0, 0);
frustum_points.push(-1, -1, 1);
frustum_points.push(1, -1, 1);
frustum_points.push(0, 0, 0);
frustum_points.push(-1, 1, 1);
frustum_points.push(1, 1, 1);
frustum_points.push(0, 0, 0);
frustum_points.push(-1 + jitter(), 1 + jitter(), 1 + jitter());
frustum_points.push(-1, -1, 1);
frustum_points.push(1 + jitter(), -1 + jitter(), 1 + jitter());
frustum_points.push(1, 1, 1);

const canonical_frustum = (
  <mesh raycast={MeshLineRaycast}>
    {/* @ts-ignore */}
    <meshLine attach="geometry" points={frustum_points} />
    {/* @ts-ignore */}
    <meshLineMaterial
      attach="material"
      transparent
      color={0xa3bffe}
      lineWidth={0.04}
    />
  </mesh>
);

interface CameraFrustumProps {
  fov: number;
  aspect: number;
  scale: number;
}

/** Helper for visualizing camera frustums.

Note that:
 - This is currently just a pyramid, note a frustum. :-)
 - We currently draw two redundant/overlapping lines. This could be optimized. */
export const CameraFrustum = React.forwardRef<THREE.Group, CameraFrustumProps>(
  (props, ref) => {
    const y = Math.tan(props.fov / 2.0);
    const x = y * props.aspect;
    return (
      <group ref={ref}>
        <CoordinateFrame scale={props.scale} />
        {React.cloneElement(canonical_frustum, {
          scale: new THREE.Vector3(
            props.scale * x,
            props.scale * y,
            props.scale
          ),
        })}
      </group>
    );
  }
);
