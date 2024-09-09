import { Instance, Instances, shaderMaterial } from "@react-three/drei";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { Outlines } from "./Outlines";
import React from "react";
import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {
  MeshBasicMaterial,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  MeshLambertMaterial,
  MeshMatcapMaterial,
  MeshNormalMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  ShadowMaterial,
  SpriteMaterial,
  RawShaderMaterial,
  ShaderMaterial,
  PointsMaterial,
  LineBasicMaterial,
  LineDashedMaterial,
} from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import {
  ImageMessage,
  MeshMessage,
  SkinnedMeshMessage,
} from "./WebsocketMessages";
import { ViewerContext } from "./App";

type AllPossibleThreeJSMaterials =
  | MeshBasicMaterial
  | MeshDepthMaterial
  | MeshDistanceMaterial
  | MeshLambertMaterial
  | MeshMatcapMaterial
  | MeshNormalMaterial
  | MeshPhongMaterial
  | MeshPhysicalMaterial
  | MeshStandardMaterial
  | MeshToonMaterial
  | ShadowMaterial
  | SpriteMaterial
  | RawShaderMaterial
  | ShaderMaterial
  | PointsMaterial
  | LineBasicMaterial
  | LineDashedMaterial;

const originGeom = new THREE.SphereGeometry(1.0);
const originMaterial = new THREE.MeshBasicMaterial({ color: 0xecec00 });

const PointCloudMaterial = /* @__PURE__ */ shaderMaterial(
  { scale: 1.0, point_ball_norm: 0.0 },
  `
  varying vec3 vPosition;
  varying vec3 vColor; // in the vertex shader
  uniform float scale;

  void main() {
      vPosition = position;
      vColor = color;
      vec4 world_pos = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * world_pos;
      gl_PointSize = (scale / -world_pos.z);
  }
   `,
  `varying vec3 vPosition;
  varying vec3 vColor;
  uniform float point_ball_norm;

  void main() {
      if (point_ball_norm < 1000.0) {
          float r = pow(
              pow(abs(gl_PointCoord.x - 0.5), point_ball_norm)
              + pow(abs(gl_PointCoord.y - 0.5), point_ball_norm),
              1.0 / point_ball_norm);
          if (r > 0.5) discard;
      }
      gl_FragColor = vec4(vColor, 1.0);
  }
   `,
);

export const PointCloud = React.forwardRef<
  THREE.Points,
  {
    pointSize: number;
    /** We visualize each point as a 2D ball, which is defined by some norm. */
    pointBallNorm: number;
    points: Float32Array;
    colors: Float32Array;
  }
>(function PointCloud(props, ref) {
  const getThreeState = useThree((state) => state.get);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(props.points, 3),
  );
  geometry.computeBoundingSphere();
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(props.colors, 3),
  );

  const [material] = React.useState(
    () => new PointCloudMaterial({ vertexColors: true }),
  );
  material.uniforms.scale.value = 10.0;
  material.uniforms.point_ball_norm.value = props.pointBallNorm;

  React.useEffect(() => {
    return () => {
      material.dispose();
      geometry.dispose();
    };
  });

  const rendererSize = new THREE.Vector2();
  useFrame(() => {
    // Match point scale to behavior of THREE.PointsMaterial().
    if (material === undefined) return;
    // point px height / actual height = point meters height / frustum meters height
    // frustum meters height = math.tan(fov / 2.0) * z
    // point px height = (point meters height / math.tan(fov / 2.0) * actual height)  / z
    material.uniforms.scale.value =
      (props.pointSize /
        Math.tan(
          (((getThreeState().camera as THREE.PerspectiveCamera).fov / 180.0) *
            Math.PI) /
            2.0,
        )) *
      getThreeState().gl.getSize(rendererSize).height *
      getThreeState().gl.getPixelRatio();
  });
  return <points ref={ref} geometry={geometry} material={material} />;
});

/** Component for rendering the contents of GLB files. */
export const GlbAsset = React.forwardRef<
  THREE.Group,
  { glb_data: Uint8Array; scale: number }
>(function GlbAsset({ glb_data, scale }, ref) {
  // We track both the GLTF asset itself and all meshes within it. Meshes are
  // used for hover effects.
  const [gltf, setGltf] = React.useState<GLTF>();
  const [meshes, setMeshes] = React.useState<THREE.Mesh[]>([]);

  // glTF/GLB files support animations.
  const mixerRef = React.useRef<THREE.AnimationMixer | null>(null);

  React.useEffect(() => {
    const loader = new GLTFLoader();

    // We use a CDN for Draco. We could move this locally if we want to use Viser offline.
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    loader.setDRACOLoader(dracoLoader);

    loader.parse(
      glb_data.buffer,
      "",
      (gltf) => {
        if (gltf.animations && gltf.animations.length) {
          mixerRef.current = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => {
            mixerRef.current!.clipAction(clip).play();
          });
        }
        const meshes: THREE.Mesh[] = [];
        gltf?.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) meshes.push(obj);
        });
        setMeshes(meshes);
        setGltf(gltf);
      },
      (error) => {
        console.log("Error loading GLB!");
        console.log(error);
      },
    );

    return () => {
      if (mixerRef.current) mixerRef.current.stopAllAction();

      function disposeNode(node: any) {
        if (node instanceof THREE.Mesh) {
          if (node.geometry) {
            node.geometry.dispose();
          }
          if (node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach((material) => {
                disposeMaterial(material);
              });
            } else {
              disposeMaterial(node.material);
            }
          }
        }
      }
      function disposeMaterial(material: AllPossibleThreeJSMaterials) {
        if ("map" in material) material.map?.dispose();
        if ("lightMap" in material) material.lightMap?.dispose();
        if ("bumpMap" in material) material.bumpMap?.dispose();
        if ("normalMap" in material) material.normalMap?.dispose();
        if ("specularMap" in material) material.specularMap?.dispose();
        if ("envMap" in material) material.envMap?.dispose();
        if ("alphaMap" in material) material.alphaMap?.dispose();
        if ("aoMap" in material) material.aoMap?.dispose();
        if ("displacementMap" in material) material.displacementMap?.dispose();
        if ("emissiveMap" in material) material.emissiveMap?.dispose();
        if ("gradientMap" in material) material.gradientMap?.dispose();
        if ("metalnessMap" in material) material.metalnessMap?.dispose();
        if ("roughnessMap" in material) material.roughnessMap?.dispose();
        material.dispose(); // disposes any programs associated with the material
      }

      // Attempt to free resources.
      gltf?.scene.traverse(disposeNode);
    };
  }, [glb_data]);

  useFrame((_, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  return (
    <group ref={ref}>
      {gltf === undefined ? null : (
        <>
          <primitive object={gltf.scene} scale={scale} />
          {meshes.map((mesh) =>
            createPortal(<OutlinesIfHovered alwaysMounted />, mesh),
          )}
        </>
      )}
    </group>
  );
});

/** Helper for adding coordinate frames as scene nodes. */
export const CoordinateFrame = React.forwardRef<
  THREE.Group,
  {
    showAxes?: boolean;
    axesLength?: number;
    axesRadius?: number;
    originRadius?: number;
  }
>(function CoordinateFrame(
  {
    showAxes = true,
    axesLength = 0.5,
    axesRadius = 0.0125,
    originRadius = undefined,
  },
  ref,
) {
  originRadius = originRadius ?? axesRadius * 2;
  return (
    <group ref={ref}>
      {showAxes && (
        <>
          <mesh
            geometry={originGeom}
            material={originMaterial}
            scale={new THREE.Vector3(originRadius, originRadius, originRadius)}
          >
            <OutlinesIfHovered />
          </mesh>
          <Instances limit={3}>
            <meshBasicMaterial />
            <cylinderGeometry args={[axesRadius, axesRadius, axesLength, 16]} />
            <Instance
              rotation={new THREE.Euler(0.0, 0.0, (3.0 * Math.PI) / 2.0)}
              position={[0.5 * axesLength, 0.0, 0.0]}
              color={0xcc0000}
            >
              <OutlinesIfHovered />
            </Instance>
            <Instance position={[0.0, 0.5 * axesLength, 0.0]} color={0x00cc00}>
              <OutlinesIfHovered />
            </Instance>
            <Instance
              rotation={new THREE.Euler(Math.PI / 2.0, 0.0, 0.0)}
              position={[0.0, 0.0, 0.5 * axesLength]}
              color={0x0000cc}
            >
              <OutlinesIfHovered />
            </Instance>
          </Instances>
        </>
      )}
    </group>
  );
});

/** Helper for adding batched/instanced coordinate frames as scene nodes. */
export const InstancedAxes = React.forwardRef<
  THREE.Group,
  {
    wxyzsBatched: Float32Array;
    positionsBatched: Float32Array;
    axes_length?: number;
    axes_radius?: number;
  }
>(function InstancedAxes(
  {
    wxyzsBatched: instance_wxyzs,
    positionsBatched: instance_positions,
    axes_length = 0.5,
    axes_radius = 0.0125,
  },
  ref,
) {
  const axesRef = React.useRef<THREE.InstancedMesh>(null);

  const cylinderGeom = new THREE.CylinderGeometry(
    axes_radius,
    axes_radius,
    axes_length,
    16,
  );
  const material = new MeshBasicMaterial();

  // Dispose when done.
  React.useEffect(() => {
    return () => {
      cylinderGeom.dispose();
      material.dispose();
    };
  });

  // Update instance matrices and colors.
  React.useEffect(() => {
    // Pre-allocate to avoid garbage collector from running during loop.
    const T_world_frame = new THREE.Matrix4();
    const T_world_framex = new THREE.Matrix4();
    const T_world_framey = new THREE.Matrix4();
    const T_world_framez = new THREE.Matrix4();

    const T_frame_framex = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(0.0, 0.0, (3.0 * Math.PI) / 2.0))
      .setPosition(0.5 * axes_length, 0.0, 0.0);
    const T_frame_framey = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(0.0, 0.0, 0.0))
      .setPosition(0.0, 0.5 * axes_length, 0.0);
    const T_frame_framez = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(Math.PI / 2.0, 0.0, 0.0))
      .setPosition(0.0, 0.0, 0.5 * axes_length);

    const tmpQuat = new THREE.Quaternion();

    const red = new THREE.Color(0xcc0000);
    const green = new THREE.Color(0x00cc00);
    const blue = new THREE.Color(0x0000cc);

    for (let i = 0; i < instance_wxyzs.length / 4; i++) {
      T_world_frame.makeRotationFromQuaternion(
        tmpQuat.set(
          instance_wxyzs[i * 4 + 1],
          instance_wxyzs[i * 4 + 2],
          instance_wxyzs[i * 4 + 3],
          instance_wxyzs[i * 4 + 0],
        ),
      ).setPosition(
        instance_positions[i * 3 + 0],
        instance_positions[i * 3 + 1],
        instance_positions[i * 3 + 2],
      );
      T_world_framex.copy(T_world_frame).multiply(T_frame_framex);
      T_world_framey.copy(T_world_frame).multiply(T_frame_framey);
      T_world_framez.copy(T_world_frame).multiply(T_frame_framez);

      axesRef.current!.setMatrixAt(i * 3 + 0, T_world_framex);
      axesRef.current!.setMatrixAt(i * 3 + 1, T_world_framey);
      axesRef.current!.setMatrixAt(i * 3 + 2, T_world_framez);

      axesRef.current!.setColorAt(i * 3 + 0, red);
      axesRef.current!.setColorAt(i * 3 + 1, green);
      axesRef.current!.setColorAt(i * 3 + 2, blue);
    }
    axesRef.current!.instanceMatrix.needsUpdate = true;
    axesRef.current!.instanceColor!.needsUpdate = true;
  }, [instance_wxyzs, instance_positions]);

  return (
    <group ref={ref}>
      <instancedMesh
        ref={axesRef}
        args={[cylinderGeom, material, (instance_wxyzs.length / 4) * 3]}
      >
        <OutlinesIfHovered />
      </instancedMesh>
    </group>
  );
});

/** Convert raw RGB color buffers to linear color buffers. **/
function threeColorBufferFromUint8Buffer(colors: ArrayBuffer) {
  return new THREE.Float32BufferAttribute(
    new Float32Array(new Uint8Array(colors)).map((value) => {
      value = value / 255.0;
      if (value <= 0.04045) {
        return value / 12.92;
      } else {
        return Math.pow((value + 0.055) / 1.055, 2.4);
      }
    }),
    3,
  );
}
export const ViserMesh = React.forwardRef<
  THREE.Mesh | THREE.SkinnedMesh,
  MeshMessage | SkinnedMeshMessage
>(function ViserMesh(props, ref) {
  const viewer = React.useContext(ViewerContext)!;

  const generateGradientMap = (shades: 3 | 5) => {
    const texture = new THREE.DataTexture(
      Uint8Array.from(
        shades == 3
          ? [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]
          : [
              0, 0, 0, 255, 64, 64, 64, 255, 128, 128, 128, 255, 192, 192, 192,
              255, 255, 255, 255, 255,
            ],
      ),
      shades,
      1,
      THREE.RGBAFormat,
    );

    texture.needsUpdate = true;
    return texture;
  };
  const standardArgs = {
    color: props.color ?? undefined,
    vertexColors: props.vertex_colors !== null,
    wireframe: props.wireframe,
    transparent: props.opacity !== null,
    opacity: props.opacity ?? 1.0,
    // Flat shading only makes sense for non-wireframe materials.
    flatShading: props.flat_shading && !props.wireframe,
    side: {
      front: THREE.FrontSide,
      back: THREE.BackSide,
      double: THREE.DoubleSide,
    }[props.side],
  };
  const assertUnreachable = (x: never): never => {
    throw new Error(`Should never get here! ${x}`);
  };

  const [material, setMaterial] = React.useState<THREE.Material>();
  const [geometry, setGeometry] = React.useState<THREE.BufferGeometry>();
  const [skeleton, setSkeleton] = React.useState<THREE.Skeleton>();
  const bonesRef = React.useRef<THREE.Bone[]>();

  const xyzw_quat = React.useMemo(() => new THREE.Quaternion(), []);
  React.useEffect(() => {
    const material =
      props.material == "standard" || props.wireframe
        ? new THREE.MeshStandardMaterial(standardArgs)
        : props.material == "toon3"
          ? new THREE.MeshToonMaterial({
              gradientMap: generateGradientMap(3),
              ...standardArgs,
            })
          : props.material == "toon5"
            ? new THREE.MeshToonMaterial({
                gradientMap: generateGradientMap(5),
                ...standardArgs,
              })
            : assertUnreachable(props.material);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        new Float32Array(
          props.vertices.buffer.slice(
            props.vertices.byteOffset,
            props.vertices.byteOffset + props.vertices.byteLength,
          ),
        ),
        3,
      ),
    );
    if (props.vertex_colors !== null) {
      geometry.setAttribute(
        "color",
        threeColorBufferFromUint8Buffer(props.vertex_colors),
      );
    }

    geometry.setIndex(
      new THREE.Uint32BufferAttribute(
        new Uint32Array(
          props.faces.buffer.slice(
            props.faces.byteOffset,
            props.faces.byteOffset + props.faces.byteLength,
          ),
        ),
        1,
      ),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    if (props.type === "SkinnedMeshMessage") {
      // Skinned mesh.
      const bones: THREE.Bone[] = [];
      bonesRef.current = bones;
      for (let i = 0; i < props.bone_wxyzs!.length; i++) {
        bones.push(new THREE.Bone());
      }
      const boneInverses: THREE.Matrix4[] = [];
      viewer.skinnedMeshState.current[props.name] = {
        initialized: false,
        poses: [],
      };
      bones.forEach((bone, i) => {
        const wxyz = props.bone_wxyzs[i];
        const position = props.bone_positions[i];
        xyzw_quat.set(wxyz[1], wxyz[2], wxyz[3], wxyz[0]);

        const boneInverse = new THREE.Matrix4();
        boneInverse.makeRotationFromQuaternion(xyzw_quat);
        boneInverse.setPosition(position[0], position[1], position[2]);
        boneInverse.invert();
        boneInverses.push(boneInverse);

        bone.quaternion.copy(xyzw_quat);
        bone.position.set(position[0], position[1], position[2]);
        bone.matrixAutoUpdate = false;
        bone.matrixWorldAutoUpdate = false;

        viewer.skinnedMeshState.current[props.name].poses.push({
          wxyz: wxyz,
          position: position,
        });
      });
      const skeleton = new THREE.Skeleton(bones, boneInverses);
      setSkeleton(skeleton);

      geometry.setAttribute(
        "skinIndex",
        new THREE.Uint16BufferAttribute(
          new Uint16Array(
            props.skin_indices.buffer.slice(
              props.skin_indices.byteOffset,
              props.skin_indices.byteOffset + props.skin_indices.byteLength,
            ),
          ),
          4,
        ),
      );
      geometry.setAttribute(
        "skinWeight",
        new THREE.Float32BufferAttribute(
          new Float32Array(
            props.skin_weights!.buffer.slice(
              props.skin_weights!.byteOffset,
              props.skin_weights!.byteOffset + props.skin_weights!.byteLength,
            ),
          ),
          4,
        ),
      );
    }

    setMaterial(material);
    setGeometry(geometry);
    return () => {
      // TODO: we can switch to the react-three-fiber <bufferGeometry />,
      // <meshStandardMaterial />, etc components to avoid manual
      // disposal.
      geometry.dispose();
      material.dispose();
      if (props.type === "SkinnedMeshMessage") {
        delete viewer.skinnedMeshState.current[props.name];
        skeleton !== undefined && skeleton.dispose();
      }
    };
  }, [props]);

  // Update bone transforms for skinned meshes.
  useFrame(() => {
    if (props.type !== "SkinnedMeshMessage") return;

    const parentNode = viewer.nodeRefFromName.current[props.name];
    if (parentNode === undefined) return;

    const state = viewer.skinnedMeshState.current[props.name];
    const bones = bonesRef.current;
    if (bones !== undefined) {
      bones.forEach((bone, i) => {
        if (!state.initialized) {
          parentNode.add(bone);
        }
        const wxyz = state.initialized
          ? state.poses[i].wxyz
          : props.bone_wxyzs[i];
        const position = state.initialized
          ? state.poses[i].position
          : props.bone_positions[i];

        xyzw_quat.set(wxyz[1], wxyz[2], wxyz[3], wxyz[0]);
        bone.matrix.makeRotationFromQuaternion(xyzw_quat);
        bone.matrix.setPosition(position[0], position[1], position[2]);
        bone.updateMatrixWorld();
      });

      if (!state.initialized) {
        state.initialized = true;
      }
    }
  });

  if (geometry === undefined || material === undefined) {
    return;
  } else if (props.type === "SkinnedMeshMessage") {
    return (
      <skinnedMesh
        ref={ref as React.ForwardedRef<THREE.SkinnedMesh>}
        geometry={geometry}
        material={material}
        skeleton={skeleton}
        // TODO: leaving culling on (default) sometimes causes the
        // mesh to randomly disappear, as of r3f==8.16.2.
        //
        // Probably this is because we don't update the bounding
        // sphere after the bone transforms change.
        frustumCulled={false}
      >
        <OutlinesIfHovered alwaysMounted />
      </skinnedMesh>
    );
  } else {
    // Normal mesh.
    return (
      <mesh
        ref={ref as React.ForwardedRef<THREE.Mesh>}
        geometry={geometry}
        material={material}
      >
        <OutlinesIfHovered alwaysMounted />
      </mesh>
    );
  }
});

export const ViserImage = React.forwardRef<THREE.Group, ImageMessage>(
  function ViserImage(props, ref) {
    const [imageTexture, setImageTexture] = React.useState<THREE.Texture>();

    React.useEffect(() => {
      if (props.media_type !== null && props.data !== null) {
        const image_url = URL.createObjectURL(new Blob([props.data]));
        new THREE.TextureLoader().load(image_url, (texture) => {
          setImageTexture(texture);
          URL.revokeObjectURL(image_url);
        });
      }
    }, [props.media_type, props.data]);
    return (
      <group ref={ref}>
        <mesh rotation={new THREE.Euler(Math.PI, 0.0, 0.0)}>
          <OutlinesIfHovered />
          <planeGeometry
            attach="geometry"
            args={[props.render_width, props.render_height]}
          />
          <meshBasicMaterial
            attach="material"
            transparent={true}
            side={THREE.DoubleSide}
            map={imageTexture}
            toneMapped={false}
          />
        </mesh>
      </group>
    );
  },
);

/** Helper for visualizing camera frustums. */
export const CameraFrustum = React.forwardRef<
  THREE.Group,
  {
    fov: number;
    aspect: number;
    scale: number;
    color: number;
    imageBinary: Uint8Array | null;
    imageMediaType: string | null;
  }
>(function CameraFrustum(props, ref) {
  const [imageTexture, setImageTexture] = React.useState<THREE.Texture>();

  React.useEffect(() => {
    if (props.imageMediaType !== null && props.imageBinary !== null) {
      const image_url = URL.createObjectURL(new Blob([props.imageBinary]));
      new THREE.TextureLoader().load(image_url, (texture) => {
        setImageTexture(texture);
        URL.revokeObjectURL(image_url);
      });
    }
  }, [props.imageMediaType, props.imageBinary]);

  let y = Math.tan(props.fov / 2.0);
  let x = y * props.aspect;
  let z = 1.0;

  const volumeScale = Math.cbrt((x * y * z) / 3.0);
  x /= volumeScale;
  y /= volumeScale;
  z /= volumeScale;

  function scaledLineSegments(points: [number, number, number][]) {
    points = points.map((xyz) => [xyz[0] * x, xyz[1] * y, xyz[2] * z]);
    return [...Array(points.length - 1).keys()].map((i) => (
      <LineSegmentInstance
        key={i}
        start={new THREE.Vector3()
          .fromArray(points[i])
          .multiplyScalar(props.scale)}
        end={new THREE.Vector3()
          .fromArray(points[i + 1])
          .multiplyScalar(props.scale)}
        color={props.color}
      />
    ));
  }

  return (
    <group ref={ref}>
      <Instances limit={9}>
        <meshBasicMaterial color={props.color} side={THREE.DoubleSide} />
        <cylinderGeometry
          args={[props.scale * 0.03, props.scale * 0.03, 1.0, 3]}
        />
        {scaledLineSegments([
          // Rectangle.
          [-1, -1, 1],
          [1, -1, 1],
          [1, 1, 1],
          [-1, 1, 1],
          [-1, -1, 1],
        ])}
        {scaledLineSegments([
          // Lines to origin.
          [-1, -1, 1],
          [0, 0, 0],
          [1, -1, 1],
        ])}
        {scaledLineSegments([
          // Lines to origin.
          [-1, 1, 1],
          [0, 0, 0],
          [1, 1, 1],
        ])}
        {scaledLineSegments([
          // Up direction.
          [0.0, -1.2, 1.0],
          [0.0, -0.9, 1.0],
        ])}
      </Instances>
      {imageTexture && (
        <mesh
          position={[0.0, 0.0, props.scale * z]}
          rotation={new THREE.Euler(Math.PI, 0.0, 0.0)}
        >
          <planeGeometry
            attach="geometry"
            args={[props.scale * props.aspect * y * 2, props.scale * y * 2]}
          />
          <meshBasicMaterial
            attach="material"
            transparent={true}
            side={THREE.DoubleSide}
            map={imageTexture}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
});

function LineSegmentInstance(props: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: number;
}) {
  const desiredDirection = new THREE.Vector3()
    .subVectors(props.end, props.start)
    .normalize();
  const canonicalDirection = new THREE.Vector3(0.0, 1.0, 0.0);
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    canonicalDirection,
    desiredDirection,
  );

  const length = props.start.distanceTo(props.end);
  const midpoint = new THREE.Vector3()
    .addVectors(props.start, props.end)
    .divideScalar(2.0);

  return (
    <Instance
      position={midpoint}
      quaternion={orientation}
      scale={[1.0, length, 1.0]}
    >
      <OutlinesIfHovered creaseAngle={0.0} />
    </Instance>
  );
}

export const HoverableContext =
  React.createContext<React.MutableRefObject<boolean> | null>(null);

/** Outlines object, which should be placed as a child of all meshes that might
 * be clickable. */
export function OutlinesIfHovered(
  props: { alwaysMounted?: boolean; creaseAngle?: number } = {
    // Can be set to true for objects like meshes which may be slow to mount.
    // It seems better to set to False for instanced meshes, there may be some
    // drei or fiber-related race conditions...
    alwaysMounted: false,
    // Some thing just look better with no creasing, like camera frustum objects.
    creaseAngle: Math.PI,
  },
) {
  const groupRef = React.useRef<THREE.Group>(null);
  const hoveredRef = React.useContext(HoverableContext);
  const [mounted, setMounted] = React.useState(true);

  useFrame(() => {
    if (hoveredRef === null) return;
    if (props.alwaysMounted) {
      if (groupRef.current === null) return;
      groupRef.current.visible = hoveredRef.current;
    } else if (hoveredRef.current != mounted) {
      setMounted(hoveredRef.current);
    }
  });
  return hoveredRef === null || !mounted ? null : (
    <Outlines
      ref={groupRef}
      thickness={10}
      screenspace={true}
      color={0xfbff00}
      opacity={0.8}
      transparent={true}
      angle={props.creaseAngle}
    />
  );
}
