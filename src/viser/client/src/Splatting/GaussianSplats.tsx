import React from "react";
import * as THREE from "three";
import SplatSortWorker from "./SplatSortWorker?worker";
import { useFrame, useThree } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";

export type GaussianBuffers = {
  // See: https://github.com/quadjr/aframe-gaussian-splatting
  //
  // - x as f32
  // - y as f32
  // - z as f32
  // - cov scale as f32
  floatBuffer: Float32Array;
  // cov1 (int16), cov2 (int16) packed in int32
  // cov3 (int16), cov4 (int16) packed in int32
  // cov5 (int16), cov6 (int16) packed in int32
  // rgba packed in int32
  intBuffer: Int32Array;
};

const GaussianSplatMaterial = /* @__PURE__ */ shaderMaterial(
  {
    numGaussians: 0,
    focal: 100.0,
    viewport: [640, 480],
    near: 1.0,
    far: 100.0,
    depthTest: true,
    depthWrite: true,
    transparent: true,
    floatBufferTexture: null,
    intBufferTexture: null,
    sortSynchronizedModelViewMatrix: new THREE.Matrix4(),
    transitionInState: 0.0,
  },
  `precision highp usampler2D; // Most important: ints must be 32-bit.
  precision mediump sampler2D;

  // Index from the splat sorter.
  attribute uint sortedIndex;

  // Buffers for splat data; each Gaussian gets 4 floats and 4 int32s. We just
  // copy quadjr for this.
  uniform sampler2D floatBufferTexture;
  uniform usampler2D intBufferTexture;

  // Various other uniforms...
  uniform uint numGaussians;
  uniform vec2 focal;
  uniform vec2 viewport;
  uniform float near;
  uniform float far;

  // Depth testing is useful for compositing multiple splat objects, but causes
  // artifacts when closer Gaussians are rendered before further ones. Synchronizing
  // the modelViewMatrix updates used for depth computation with the splat sorter
  // mitigates this for Gaussians within the same object.
  uniform mat4 sortSynchronizedModelViewMatrix;

  // Fade in state between [0, 1].
  uniform float transitionInState;

  varying vec4 vRgba;
  varying vec3 vPosition;

  vec2 unpackInt16(in uint value) {
    int v = int(value);
    int v0 = v >> 16;
    int v1 = (v & 0xFFFF);
    if((v & 0x8000) != 0)
      v1 |= 0xFFFF0000;
    return vec2(float(v1), float(v0));
  }

  void main () {
    // Get position + scale from float buffer.
    ivec2 texSize = textureSize(floatBufferTexture, 0);
    ivec2 texPos = ivec2(sortedIndex % uint(texSize.x), sortedIndex / uint(texSize.x));
    vec4 floatBufferData = texelFetch(floatBufferTexture, texPos, 0);
    vec3 center = floatBufferData.xyz;

    float perGaussianShift = 1.0 - (float(numGaussians * 2u) - float(sortedIndex)) / float(numGaussians * 2u);
    float cov_scale = floatBufferData.w * max(0.0, transitionInState - perGaussianShift) / (1.0 - perGaussianShift);

    // Get covariance terms from int buffer.
    uvec4 intBufferData = texelFetch(intBufferTexture, texPos, 0);
    uint rgbaUint32 = intBufferData.w;
    vec2 cov01 = unpackInt16(intBufferData.x) / 32767. * cov_scale;
    vec2 cov23 = unpackInt16(intBufferData.y) / 32767. * cov_scale;
    vec2 cov45 = unpackInt16(intBufferData.z) / 32767. * cov_scale;

    // Get center wrt camera. modelViewMatrix is T_cam_world.
    vec4 c_cam = modelViewMatrix * vec4(center, 1);
    vec4 pos2d = projectionMatrix * c_cam;

    vec4 c_camstable = sortSynchronizedModelViewMatrix * vec4(center, 1);
    vec4 stablePos2d = projectionMatrix * c_camstable;

    // Do the actual splatting.
    mat3 cov3d = mat3(
        cov01.x, cov01.y, cov23.x,
        cov01.y, cov23.y, cov45.x,
        cov23.x, cov45.x, cov45.y
    );
    mat3 J = mat3(
        // Matrices are column-major.
        focal.x / c_cam.z, 0., 0.0,
        0., focal.y / c_cam.z, 0.0,
        -(focal.x * c_cam.x) / (c_cam.z * c_cam.z), -(focal.y * c_cam.y) / (c_cam.z * c_cam.z), 0.
    );
    mat3 A = J * mat3(modelViewMatrix);
    mat3 cov_proj = A * cov3d * transpose(A);
    float diag1 = cov_proj[0][0] + 0.3;
    float offDiag = cov_proj[0][1];
    float diag2 = cov_proj[1][1] + 0.3;

    // Eigendecomposition.
    float mid = 0.5 * (diag1 + diag2);
    float radius = length(vec2((diag1 - diag2) / 2.0, offDiag));
    float lambda1 = mid + radius;
    float lambda2 = max(mid - radius, 0.1);
    vec2 diagonalVector = normalize(vec2(offDiag, lambda1 - diag1));
    vec2 v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
    vec2 v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

    vRgba = vec4(
      float(rgbaUint32 & uint(0xFF)) / 255.0,
      float((rgbaUint32 >> uint(8)) & uint(0xFF)) / 255.0,
      float((rgbaUint32 >> uint(16)) & uint(0xFF)) / 255.0,
      float(rgbaUint32 >> uint(24)) / 255.0
    );
    if (-c_cam.z < near || -c_cam.z > far) vRgba.a = 0.0;
    vPosition = position;

    gl_Position = vec4(
        vec2(pos2d) / pos2d.w
            + position.x * v1 / viewport * 2.0
            + position.y * v2 / viewport * 2.0, stablePos2d.z / stablePos2d.w, 1.);
  }
`,
  `precision highp float;

  uniform vec2 viewport;
  uniform vec2 focal;

  varying vec4 vRgba;
  varying vec3 vPosition;

  void main () {
    float A = -dot(vPosition.xy, vPosition.xy);
    if (A < -4.0) discard;
    float B = exp(A) * vRgba.a;
    if ( B < 0.02 ) discard;  // alphaTest.
    gl_FragColor = vec4(vRgba.rgb, B);
  }`,
);

export default function GaussianSplats({
  buffers,
}: {
  buffers: GaussianBuffers;
}) {
  const [geometry, setGeometry] = React.useState<THREE.BufferGeometry>();
  const [material, setMaterial] = React.useState<THREE.ShaderMaterial>();
  const splatSortWorkerRef = React.useRef<Worker | null>(null);
  const maxTextureSize = useThree((state) => state.gl).capabilities
    .maxTextureSize;
  const initializedTextures = React.useRef<boolean>(false);
  const [sortSynchronizedModelViewMatrix] = React.useState(new THREE.Matrix4());

  // We'll use the vanilla three.js API, which for our use case is more
  // flexible than the declarative version (particularly for operations like
  // dynamic updates to buffers and shader uniforms).
  React.useEffect(() => {
    // Create geometry. Each Gaussian will be rendered as a quad.
    const geometry = new THREE.InstancedBufferGeometry();
    const numGaussians = buffers.floatBuffer.length / 4;
    geometry.instanceCount = numGaussians;

    // Quad geometry.
    geometry.setIndex(
      new THREE.BufferAttribute(new Uint32Array([0, 2, 1, 0, 3, 2]), 1),
    );
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]),
        2,
      ),
    );

    // Rendering order for Gaussians.
    const sortedIndexAttribute = new THREE.InstancedBufferAttribute(
      new Uint32Array(numGaussians),
      1,
    );
    sortedIndexAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("sortedIndex", sortedIndexAttribute);

    // Create texture buffers.
    const textureWidth = Math.min(numGaussians, maxTextureSize);
    const textureHeight = Math.ceil(numGaussians / textureWidth);

    const floatBufferPadded = new Float32Array(
      textureWidth * textureHeight * 4,
    );
    floatBufferPadded.set(buffers.floatBuffer);
    const intBufferPadded = new Uint32Array(textureWidth * textureHeight * 4);
    intBufferPadded.set(buffers.intBuffer);

    const floatBufferTexture = new THREE.DataTexture(
      floatBufferPadded,
      textureWidth,
      textureHeight,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    const intBufferTexture = new THREE.DataTexture(
      intBufferPadded,
      textureWidth,
      textureHeight,
      THREE.RGBAIntegerFormat,
      THREE.UnsignedIntType,
    );
    intBufferTexture.internalFormat = "RGBA32UI";

    const material = new GaussianSplatMaterial({
      // @ts-ignore
      floatBufferTexture: floatBufferTexture,
      intBufferTexture: intBufferTexture,
      numGaussians: 0,
      transitionInState: 0.0,
      sortSynchronizedModelViewMatrix: new THREE.Matrix4(),
    });

    // Update component state.
    setGeometry(geometry);
    setMaterial(material);

    // Create sorting worker.
    const sortWorker = new SplatSortWorker();
    sortWorker.onmessage = (e) => {
      sortedIndexAttribute.set(e.data.sortedIndices as Int32Array);
      material.uniforms.sortSynchronizedModelViewMatrix.value.copy(
        sortSynchronizedModelViewMatrix,
      );
      sortedIndexAttribute.needsUpdate = true;
      // A simple but reasonably effective heuristic for render ordering.
      //
      // To minimize artifacts:
      // - When there are multiple splat objects, we want to render the closest
      //   ones *last*. This improves the likelihood of correct alpha
      //   compositing and reduces reliance on alpha testing.
      // - We generally want to render other objects like meshes *before*
      //   Gaussians. They're usually opaque.
      console.log(e.data.minDepth);
      meshRef.current!.renderOrder = (-e.data.minDepth as number) + 1000.0;

      // Trigger initial render.
      if (!initializedTextures.current) {
        material.uniforms.numGaussians.value = numGaussians;
        floatBufferTexture.needsUpdate = true;
        intBufferTexture.needsUpdate = true;
        initializedTextures.current = true;
      }
    };
    sortWorker.postMessage({
      setFloatBuffer: buffers.floatBuffer,
    });
    splatSortWorkerRef.current = sortWorker;

    // We should always re-send view projection when buffers are replaced.
    prevT_camera_obj.identity();

    return () => {
      intBufferTexture.dispose();
      floatBufferTexture.dispose();
      geometry.dispose();
      if (material !== undefined) material.dispose();
      sortWorker.postMessage({ close: true });
    };
  }, [buffers]);

  // Synchronize view projection matrix with sort worker. We pre-allocate some
  // matrices to make life easier for the garbage collector.
  const meshRef = React.useRef<THREE.Mesh>(null);
  const [prevT_camera_obj] = React.useState(new THREE.Matrix4());
  const [T_camera_obj] = React.useState(new THREE.Matrix4());

  useFrame((state) => {
    const mesh = meshRef.current;
    const sortWorker = splatSortWorkerRef.current;
    if (mesh === null || sortWorker === null) return;

    // Update camera parameter uniforms.
    const dpr = state.viewport.dpr;
    const fovY =
      ((state.camera as THREE.PerspectiveCamera).fov * Math.PI) / 180.0;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * state.viewport.aspect);
    const fy = (dpr * state.size.height) / (2 * Math.tan(fovY / 2));
    const fx = (dpr * state.size.width) / (2 * Math.tan(fovX / 2));

    if (material === undefined) return;
    material.uniforms.transitionInState.value = Math.min(
      material.uniforms.transitionInState.value + 0.01,
      1.0,
    );
    material.uniforms.focal.value = [fx, fy];
    material.uniforms.near.value = state.camera.near;
    material.uniforms.far.value = state.camera.far;
    material.uniforms.viewport.value = [
      state.size.width * dpr,
      state.size.height * dpr,
    ];

    // Compute view projection matrix.
    // T_camera_obj = T_cam_world * T_world_obj.
    T_camera_obj.copy(state.camera.matrixWorldInverse).multiply(
      mesh.matrixWorld,
    );

    // If changed, use projection matrix to sort Gaussians.
    if (
      prevT_camera_obj === undefined ||
      !T_camera_obj.equals(prevT_camera_obj)
    ) {
      sortSynchronizedModelViewMatrix.copy(T_camera_obj);
      sortWorker.postMessage({ setT_camera_obj: T_camera_obj.elements });
      prevT_camera_obj.copy(T_camera_obj);
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}
