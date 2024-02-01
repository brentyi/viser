// @refresh reset
import { Notifications } from "@mantine/notifications";

import {
  AdaptiveDpr,
  AdaptiveEvents,
  CameraControls,
  Environment,
} from "@react-three/drei";
import * as THREE from "three";
import { Canvas, useThree, useFrame } from "@react-three/fiber";

import { SynchronizedCameraControls } from "./CameraControls";
import {
  Anchor,
  Box,
  Image,
  MantineProvider,
  MediaQuery,
  Modal,
  useMantineTheme,
} from "@mantine/core";
import React, { useEffect } from "react";
import { SceneNodeThreeObject, UseSceneTree } from "./SceneTree";

import "./index.css";

import ControlPanel from "./ControlPanel/ControlPanel";
import {
  UseGui,
  useGuiState,
  useViserMantineTheme,
} from "./ControlPanel/GuiState";
import { searchParamKey } from "./SearchParamsUtils";
import {
  WebsocketMessageProducer,
  FrameSynchronizedMessageHandler,
} from "./WebsocketInterface";

import { Titlebar } from "./Titlebar";
import { ViserModal } from "./Modal";
import { useSceneTreeState } from "./SceneTreeState";
import { GetRenderRequestMessage, Message } from "./WebsocketMessages";
import { makeThrottledMessageSender } from "./WebsocketFunctions";
import { useDisclosure } from "@mantine/hooks";
import { rayToViserCoords } from "./WorldTransformUtils";
import { normalizeClick, isClickValid } from "./ClickUtils";
import { maxHeaderSize } from "http";

export type ViewerContextContents = {
  // Zustand hooks.
  useSceneTree: UseSceneTree;
  useGui: UseGui;
  // Useful references.
  websocketRef: React.MutableRefObject<WebSocket | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  backgroundMaterialRef: React.MutableRefObject<THREE.ShaderMaterial | null>;
  cameraControlRef: React.MutableRefObject<CameraControls | null>;
  sendCameraRef: React.MutableRefObject<(() => void) | null>;
  resetCameraViewRef: React.MutableRefObject<(() => void) | null>;
  // Scene node attributes.
  // This is intentionally placed outside of the Zustand state to reduce overhead.
  nodeAttributesFromName: React.MutableRefObject<{
    [name: string]:
      | undefined
      | {
          wxyz?: [number, number, number, number];
          position?: [number, number, number];
          visibility?: boolean;
        };
  }>;
  messageQueueRef: React.MutableRefObject<Message[]>;
  // Requested a render.
  getRenderRequestState: React.MutableRefObject<
    "ready" | "triggered" | "pause" | "in_progress"
  >;
  getRenderRequest: React.MutableRefObject<null | GetRenderRequestMessage>;
  sceneClickEnable: React.MutableRefObject<boolean>;
  // Track click drag events.
  sceneClickDragInfo: React.MutableRefObject<{
    dragOrigin: [number, number, number][];  // List of ray origins from click drag.
    dragDirection: [number, number, number][];  // List of ray directions.
    dragScreenPos: [number, number][];  //  List of mouse positions.
    dragLock: number;  // Only allow one drag event at a time.
  }>;
  // 2D canvas for drawing -- can be used to give feedback on cursor movement, or more. 
  canvas2dRef: React.MutableRefObject<HTMLCanvasElement | null>;
};
export const ViewerContext = React.createContext<null | ViewerContextContents>(
  null,
);

THREE.ColorManagement.enabled = true;

function ViewerRoot() {
  // What websocket server should we connect to?
  function getDefaultServerFromUrl() {
    // https://localhost:8080/ => ws://localhost:8080
    // https://localhost:8080/?server=some_url => ws://localhost:8080
    let server = window.location.href;
    server = server.replace("http://", "ws://");
    server = server.replace("https://", "wss://");
    server = server.split("?")[0];
    if (server.endsWith("/")) server = server.slice(0, -1);
    return server;
  }
  const servers = new URLSearchParams(window.location.search).getAll(
    searchParamKey,
  );
  const initialServer =
    servers.length >= 1 ? servers[0] : getDefaultServerFromUrl();

  // Values that can be globally accessed by components in a viewer.
  const viewer: ViewerContextContents = {
    useSceneTree: useSceneTreeState(),
    useGui: useGuiState(initialServer),
    websocketRef: React.useRef(null),
    canvasRef: React.useRef(null),
    sceneRef: React.useRef(null),
    cameraRef: React.useRef(null),
    backgroundMaterialRef: React.useRef(null),
    cameraControlRef: React.useRef(null),
    sendCameraRef: React.useRef(null),
    resetCameraViewRef: React.useRef(null),
    // Scene node attributes that aren't placed in the zustand state for performance reasons.
    nodeAttributesFromName: React.useRef({
      "": {
        wxyz: (() => {
          const quat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(Math.PI / 2, Math.PI, -Math.PI / 2),
          );
          return [quat.w, quat.x, quat.y, quat.z];
        })(),
      },
    }),
    messageQueueRef: React.useRef([]),
    getRenderRequestState: React.useRef("ready"),
    getRenderRequest: React.useRef(null),
    sceneClickEnable: React.useRef(false),
    sceneClickDragInfo: React.useRef({
      dragOrigin: [],
      dragDirection: [],
      dragScreenPos: [],
      dragLock: 0,
    }),
    canvas2dRef: React.useRef(null),
  };

  return (
    <ViewerContext.Provider value={viewer}>
      <WebsocketMessageProducer />
      <ViewerContents />
    </ViewerContext.Provider>
  );
}

function ViewerContents() {
  const viewer = React.useContext(ViewerContext)!;
  const control_layout = viewer.useGui((state) => state.theme.control_layout);
  return (
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={useViserMantineTheme()}
    >
      <Notifications
        position="top-left"
        containerWidth="20em"
        styles={{
          root: {
            boxShadow: "0.1em 0 1em 0 rgba(0,0,0,0.1) !important",
          },
        }}
      />
      <Titlebar />
      <ViserModal />
      <Box
        sx={{
          width: "100%",
          height: "1px",
          position: "relative",
          flexGrow: 1,
          display: "flex",
          flexDirection: "row",
        }}
      >
        <MediaQuery
          smallerThan={"xs"}
          styles={{
            right: 0,
            bottom:
              "4.5em" /* 4em to account for BottomPanel minimum height. */,
          }}
        >
          <Box
            sx={(theme) => ({
              backgroundColor:
                theme.colorScheme === "light" ? "#fff" : theme.colors.dark[9],
              flexGrow: 1,
              width: "10em",
              position: "relative",
            })}
          >
            <Viewer2DCanvas />
            <ViewerCanvas>
              <FrameSynchronizedMessageHandler />
            </ViewerCanvas>
            {viewer.useGui((state) => state.theme.show_logo) ? (
              <ViserLogo />
            ) : null}
          </Box>
        </MediaQuery>
        <ControlPanel control_layout={control_layout} />
      </Box>
    </MantineProvider>
  );
}

function ViewerCanvas({ children }: { children: React.ReactNode }) {
  const viewer = React.useContext(ViewerContext)!;
  const sendClickThrottled = makeThrottledMessageSender(
    viewer.websocketRef,
    20,
  );
  return (
    <Canvas
      camera={{ position: [-3.0, 3.0, -3.0], near: 0.05 }}
      gl={{ preserveDrawingBuffer: true }}
      style={{
        position: "relative",
        zIndex: 0,
        width: "100%",
        height: "100%",
      }}
      performance={{ min: 0.95 }}
      ref={viewer.canvasRef}
      // Handle scene click events (onPointerDown, onPointerMove, onPointerUp)
      onPointerDown={(e) => {
        // Only handle click events if enabled.
        if (!viewer.sceneClickEnable.current) return;

        // Check if click is valid.
        const mouseVector = normalizeClick(viewer, e);
        if (!isClickValid(mouseVector)) return;

        const drag_info = viewer.sceneClickDragInfo.current!;

        // Only allow one drag event at a time.
        if (drag_info.dragLock > 0) return;
        drag_info.dragLock += 1;

        // Reset drag info.
        drag_info.dragOrigin = [];
        drag_info.dragDirection = [];
        drag_info.dragScreenPos = [];

        // Disable camera controls -- we don't want the camera to move while we're click-dragging.
        viewer.cameraControlRef.current!.enabled = false;

        // Cast ray from current click and camera pos, and convert to viser coordinates.
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouseVector, viewer.cameraRef.current!);
        const ray = rayToViserCoords(viewer, raycaster.ray);

        // Add ray to drag info.
        drag_info.dragOrigin!.push([ray.origin.x, ray.origin.y, ray.origin.z]);
        drag_info.dragDirection!.push([ray.direction.x, ray.direction.y, ray.direction.z]);
        drag_info.dragScreenPos.push([e.nativeEvent.offsetX, e.nativeEvent.offsetY]);
      }}
      onPointerMove={(e) => {
        // Only handle if click events are enabled, and if pointer is down (i.e., dragging).
        if (!viewer.sceneClickEnable.current) return;
        if (viewer.sceneClickDragInfo.current.dragLock == 0) return;

        // Check if click is valid.
        const mouseVector = normalizeClick(viewer, e);
        if (!isClickValid(mouseVector)) return;

        // Check if mouse position has changed sufficiently from last position.
        // Uses 3px as a threshood, similar to drag detection in `SceneNodeClickMessage` from `SceneTree.tsx`.
        const drag_info = viewer.sceneClickDragInfo.current!;
        const dragScreenPos = drag_info.dragScreenPos
        if (
          (Math.abs(e.nativeEvent.offsetX - dragScreenPos![dragScreenPos.length-1][0]) <= 3) &&
          (Math.abs(e.nativeEvent.offsetY - dragScreenPos![dragScreenPos.length-1][1]) <= 3)
        )
          return;

        // Cast ray from current click and camera pos, and convert to viser coordinates.
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouseVector, viewer.cameraRef.current!);
        const ray = rayToViserCoords(viewer, raycaster.ray);

        // Add ray to drag info.
        drag_info.dragOrigin!.push([ray.origin.x, ray.origin.y, ray.origin.z]);
        drag_info.dragDirection!.push([ray.direction.x, ray.direction.y, ray.direction.z]);
        drag_info.dragScreenPos.push([e.nativeEvent.offsetX, e.nativeEvent.offsetY]);

        const ctx = viewer.canvas2dRef.current!.getContext("2d")!;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.beginPath();
        ctx.fillStyle = "blue";
        ctx.strokeStyle = "blue";
        ctx.globalAlpha = 0.2;
        ctx.moveTo(dragScreenPos[dragScreenPos.length-2][0], dragScreenPos[dragScreenPos.length-2][1]);
        ctx.lineTo(dragScreenPos[dragScreenPos.length-1][0], dragScreenPos[dragScreenPos.length-1][1]);
        // ctx.fillRect(
        //   dragScreenPos[0][0],
        //   dragScreenPos[0][1],
        //   e.nativeEvent.offsetX - dragScreenPos[0][0],
        //   e.nativeEvent.offsetY - dragScreenPos[0][1]
        //   );
        ctx.globalAlpha = 1.0;
        ctx.stroke();
      }}
      onPointerUp={(e) => {
        // Only handle if click events are enabled, and if pointer was down (i.e., dragging).
        if (!viewer.sceneClickEnable.current) return;
        if (viewer.sceneClickDragInfo.current.dragLock == 0) return;

        const drag_info = viewer.sceneClickDragInfo.current!;

        // If there's no pointer information recorded, don't send a message.
        if (drag_info.dragOrigin!.length == 0) {
          return;
        }

        const ctx = viewer.canvas2dRef.current!.getContext("2d")!;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // If there's only one pointer, send a click message.
        // The message will return origin/direction lists of length 1.
        if (drag_info.dragOrigin!.length == 1) {
          sendClickThrottled({
            type: "ScenePointerMessage",
            event_type: "click",
            ray_origin: drag_info.dragOrigin,
            ray_direction: drag_info.dragDirection,
          });
        }

        // If the ScenePointerEvent had mouse drag movement, we will send *two* messages:
        //  1. A "scribble" message, which will return the full origin/direction lists of length N.
        //  2. A "box" message, which will return ...?
        sendClickThrottled({
          type: "ScenePointerMessage",
          event_type: "scribble",
          ray_origin: drag_info.dragOrigin,
          ray_direction: drag_info.dragDirection,
        });

        // Re-enable camera controls! Was disabled in `onPointerDown`, to allow for mouse drag w/o camera movement.
        viewer.cameraControlRef.current!.enabled = true;

        // Release drag lock.
        drag_info.dragLock -= 1;
      }}
    >
      {children}
      <BackgroundImage />
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <SceneContextSetter />
      <SynchronizedCameraControls />
      <SceneNodeThreeObject name="" parent={null} />
      <Environment path="/hdri/" files="potsdamer_platz_1k.hdr" />
      <directionalLight color={0xffffff} intensity={1.0} position={[0, 1, 0]} />
      <directionalLight
        color={0xffffff}
        intensity={0.2}
        position={[0, -1, 0]}
      />
    </Canvas>
  );
}

/* HTML Canvas, for drawing 2D. */
function Viewer2DCanvas() {
  const viewer = React.useContext(ViewerContext)!;
  useEffect(() => {
    const canvas = viewer.canvas2dRef.current!.getContext("2d")!.canvas;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }, []);
  return (
    <canvas
      ref={viewer.canvas2dRef}
      style={
        {
          position: "absolute",
          zIndex: 1,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }
      }
    ></canvas>
  )
}

/* Background image with support for depth compositing. */
function BackgroundImage() {
  // Create a fragment shader that composites depth using depth and rgb
  const vertShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
  `.trim();
  const fragShader = `
  #include <packing>
  precision highp float;
  precision highp int;

  varying vec2 vUv;
  uniform sampler2D colorMap;
  uniform sampler2D depthMap;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform bool enabled;
  uniform bool hasDepth;

  float readDepth(sampler2D depthMap, vec2 coord) {
    vec4 rgbPacked = texture(depthMap, coord);

    // For the k-th channel, coefficients are calculated as: 255 * 1e-5 * 2^(8 * k).
    // Note that: [0, 255] channels are scaled to [0, 1], and we multiply by 1e5 on the server side.
    float depth = rgbPacked.r * 0.00255 + rgbPacked.g * 0.6528 + rgbPacked.b * 167.1168;
    return depth;
  }

  void main() {
    if (!enabled) {
      // discard the pixel if we're not enabled
      discard;
    }
    vec4 color = texture(colorMap, vUv);
    gl_FragColor = vec4(color.rgb, 1.0);

    float bufDepth;
    if(hasDepth){
      float depth = readDepth(depthMap, vUv);
      bufDepth = viewZToPerspectiveDepth(-depth, cameraNear, cameraFar);
    } else {
      // If no depth enabled, set depth to 1.0 (infinity) to treat it like a background image.
      bufDepth = 1.0;
    }
    gl_FragDepth = bufDepth;
  }`.trim();
  // initialize the rgb texture with all white and depth at infinity
  const backgroundMaterial = new THREE.ShaderMaterial({
    fragmentShader: fragShader,
    vertexShader: vertShader,
    uniforms: {
      enabled: { value: false },
      depthMap: { value: null },
      colorMap: { value: null },
      cameraNear: { value: null },
      cameraFar: { value: null },
      hasDepth: { value: false },
    },
  });
  const { backgroundMaterialRef } = React.useContext(ViewerContext)!;
  backgroundMaterialRef.current = backgroundMaterial;
  const backgroundMesh = React.useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    // Logic ahead relies on perspective camera assumption.
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      console.error(
        "Camera is not a perspective camera, cannot render background image",
      );
      return;
    }

    // Update the position of the mesh based on the camera position.
    const lookdir = camera.getWorldDirection(new THREE.Vector3());
    backgroundMesh.current!.position.set(
      camera.position.x,
      camera.position.y,
      camera.position.z,
    );
    backgroundMesh.current!.position.addScaledVector(lookdir, 1.0);
    backgroundMesh.current!.quaternion.copy(camera.quaternion);

    // Resize the mesh based on focal length.
    const f = camera.getFocalLength();
    backgroundMesh.current!.scale.set(
      camera.getFilmWidth() / f,
      camera.getFilmHeight() / f,
      1.0,
    );

    // Set near/far uniforms.
    backgroundMaterial.uniforms.cameraNear.value = camera.near;
    backgroundMaterial.uniforms.cameraFar.value = camera.far;
  });

  return (
    <mesh
      ref={backgroundMesh}
      material={backgroundMaterial}
      matrixWorldAutoUpdate={false}
    >
      <planeGeometry attach="geometry" args={[1, 1]} />
    </mesh>
  );
}

/** Component for helping us set the scene reference. */
function SceneContextSetter() {
  const { sceneRef, cameraRef } = React.useContext(ViewerContext)!;
  sceneRef.current = useThree((state) => state.scene);
  cameraRef.current = useThree(
    (state) => state.camera as THREE.PerspectiveCamera,
  );
  return <></>;
}

export function Root() {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ViewerRoot />
    </Box>
  );
}

/** Logo. When clicked, opens an info modal. */
function ViserLogo() {
  const [aboutModelOpened, { open: openAbout, close: closeAbout }] =
    useDisclosure(false);
  return (
    <>
      <Box
        sx={{
          position: "absolute",
          bottom: "1em",
          left: "1em",
          cursor: "pointer",
        }}
        component="a"
        onClick={openAbout}
        title="About Viser"
      >
        <Image src="/logo.svg" width="2.5em" height="auto" />
      </Box>
      <Modal
        opened={aboutModelOpened}
        onClose={closeAbout}
        withCloseButton={false}
        size="xl"
        ta="center"
      >
        <Box>
          <Image
            src={
              useMantineTheme().colorScheme === "dark"
                ? "viser_banner_dark.svg"
                : "viser_banner.svg"
            }
            radius="xs"
          />
          <Box mt="1.625em">
            Viser is a 3D visualization toolkit developed at UC Berkeley.
          </Box>
          <p>
            <Anchor
              href="https://github.com/nerfstudio-project/"
              target="_blank"
              fw="600"
              sx={{ "&:focus": { outline: "none" } }}
            >
              Nerfstudio
            </Anchor>
            &nbsp;&nbsp;&bull;&nbsp;&nbsp;
            <Anchor
              href="https://github.com/nerfstudio-project/viser"
              target="_blank"
              fw="600"
              sx={{ "&:focus": { outline: "none" } }}
            >
              GitHub
            </Anchor>
            &nbsp;&nbsp;&bull;&nbsp;&nbsp;
            <Anchor
              href="https://viser.studio"
              target="_blank"
              fw="600"
              sx={{ "&:focus": { outline: "none" } }}
            >
              Documentation
            </Anchor>
          </p>
        </Box>
      </Modal>
    </>
  );
}
