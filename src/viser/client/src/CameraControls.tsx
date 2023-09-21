import { ViewerContext } from "./App";
import { makeThrottledMessageSender } from "./WebsocketFunctions";
import { CameraControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as holdEvent from "hold-event";
import React, { useContext, useRef } from "react";
import { PerspectiveCamera } from "three";
import * as THREE from "three";

/** OrbitControls, but synchronized with the server and other panels. */
export function SynchronizedCameraControls() {
  const viewer = useContext(ViewerContext)!;
  const camera = useThree((state) => state.camera as PerspectiveCamera);

  const sendCameraThrottled = makeThrottledMessageSender(
    viewer.websocketRef,
    20
  );

  type CameraDetails = {
    wxyz: number[];
    position: THREE.Vector3;
    look_at: THREE.Vector3;
    up_direction: THREE.Vector3;
    aspect: number;
    fov: number;
  };

  const initialCameraRef = useRef<CameraDetails | null>(null);

  // Callback for sending cameras.
  const sendCamera = React.useCallback(() => {
    const three_camera = camera;
    const camera_control = viewer.cameraControlRef.current;

    if (camera_control === null) {
      // Camera controls not yet ready, let's re-try later.
      setTimeout(sendCamera, 10);
      return;
    }

    // We put Z up to match the scene tree, and convert threejs camera convention
    // to the OpenCV one.
    const R_threecam_cam = new THREE.Quaternion();
    const R_world_threeworld = new THREE.Quaternion();
    R_threecam_cam.setFromEuler(new THREE.Euler(Math.PI, 0.0, 0.0));
    R_world_threeworld.setFromEuler(new THREE.Euler(Math.PI / 2.0, 0.0, 0.0));
    const R_world_camera = R_world_threeworld.clone()
      .multiply(three_camera.quaternion)
      .multiply(R_threecam_cam);

    const look_at = camera_control
      .getTarget(new THREE.Vector3())
      .applyQuaternion(R_world_threeworld);
    const up = three_camera.up.clone().applyQuaternion(R_world_threeworld);

    //Store initial camera values
    if (!initialCameraRef.current) {
      const initialWxyz = [
        R_world_camera.w,
        R_world_camera.x,
        R_world_camera.y,
        R_world_camera.z,
      ];
      const initialPosition = three_camera.position
        .clone()
        .applyQuaternion(R_world_threeworld);
      const initialLookAt = look_at;
      const initialUp = up;
      const initialAspect = three_camera.aspect;
      const initialFov = (three_camera.fov * Math.PI) / 180.0;

      initialCameraRef.current = {
        wxyz: initialWxyz,
        position: initialPosition,
        look_at: initialLookAt,
        up_direction: initialUp,
        aspect: initialAspect,
        fov: initialFov,
      };
    }

    sendCameraThrottled({
      type: "ViewerCameraMessage",
      wxyz: [
        R_world_camera.w,
        R_world_camera.x,
        R_world_camera.y,
        R_world_camera.z,
      ],
      position: three_camera.position
        .clone()
        .applyQuaternion(R_world_threeworld)
        .toArray(),
      aspect: three_camera.aspect,
      fov: (three_camera.fov * Math.PI) / 180.0,
      look_at: [look_at.x, look_at.y, look_at.z],
      up_direction: [up.x, up.y, up.z],
    });
  }, [camera, sendCameraThrottled]);

  //Camera Animation code
  const animationId = useRef<number | null>(null);

  const animateCamera = () => {
    const cameraControls = viewer.cameraControlRef.current;
    if (!cameraControls || !initialCameraRef.current) return;
    const targetPosition = initialCameraRef.current.position;
    const targetLookAt = initialCameraRef.current.look_at;

    const alpha = 0.2;
    const tolerance = 0.2;

    const newPosition = new THREE.Vector3().lerpVectors(
      camera.position,
      targetPosition,
      alpha
    );
    const newLookAt = new THREE.Vector3().lerpVectors(
      cameraControls.getTarget(new THREE.Vector3()),
      targetLookAt,
      alpha
    );

    if (newPosition.distanceTo(targetPosition) < tolerance) {
      newPosition.copy(targetPosition);
    }

    if (newLookAt.distanceTo(targetLookAt) < tolerance) {
      newLookAt.copy(targetLookAt);
    }

    cameraControls.setPosition(newPosition.x, newPosition.y, newPosition.z);
    cameraControls.setTarget(newLookAt.x, newLookAt.y, newLookAt.z);

    const hasReachedTarget =
      newPosition.equals(targetPosition) && newLookAt.equals(targetLookAt);

    if (!hasReachedTarget) {
      animationId.current = requestAnimationFrame(animateCamera);
    } else {
      if (animationId.current !== null) {
        cancelAnimationFrame(animationId.current);
        animationId.current = null;
      }
    }
  };

  // Send camera for new connections.
  // We add a small delay to give the server time to add a callback.
  const connected = viewer.useGui((state) => state.websocketConnected);
  React.useEffect(() => {
    if (!connected) return;
    setTimeout(() => sendCamera(), 50);
  }, [connected, sendCamera]);

  React.useEffect(() => {
    window.addEventListener("resize", sendCamera);
    return () => {
      window.removeEventListener("resize", sendCamera);
    };
  }, [camera]);

  // Keyboard controls.
  //
  // TODO: (critical) we should move this to the root component. Currently if
  // we add 100 panes and remove 99 of them, we'll still have 100 event
  // listeners. This should also be combined with some notion notion of the
  // currently active pane, and only apply keyboard controls to that pane.
  //
  // Currently all panes listen to events all the time.
  React.useEffect(() => {
    const KEYCODE = {
      W: 87,
      A: 65,
      S: 83,
      D: 68,
      ARROW_LEFT: 37,
      ARROW_UP: 38,
      ARROW_RIGHT: 39,
      ARROW_DOWN: 40,
      SPACE: " ",
      Q: 81,
      E: 69,
    };
    const cameraControls = viewer.cameraControlRef.current!;

    const wKey = new holdEvent.KeyboardKeyHold(KEYCODE.W, 20);
    const aKey = new holdEvent.KeyboardKeyHold(KEYCODE.A, 20);
    const sKey = new holdEvent.KeyboardKeyHold(KEYCODE.S, 20);
    const dKey = new holdEvent.KeyboardKeyHold(KEYCODE.D, 20);
    const qKey = new holdEvent.KeyboardKeyHold(KEYCODE.Q, 20);
    const eKey = new holdEvent.KeyboardKeyHold(KEYCODE.E, 20);

    aKey.addEventListener("holding", (event) => {
      cameraControls.truck(-0.002 * event?.deltaTime, 0, true);
    });
    dKey.addEventListener("holding", (event) => {
      cameraControls.truck(0.002 * event?.deltaTime, 0, true);
    });
    wKey.addEventListener("holding", (event) => {
      cameraControls.forward(0.002 * event?.deltaTime, true);
    });
    sKey.addEventListener("holding", (event) => {
      cameraControls.forward(-0.002 * event?.deltaTime, true);
    });
    qKey.addEventListener("holding", (event) => {
      cameraControls.elevate(0.002 * event?.deltaTime, true);
    });
    eKey.addEventListener("holding", (event) => {
      cameraControls.elevate(-0.002 * event?.deltaTime, true);
    });

    const leftKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_LEFT, 20);
    const rightKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_RIGHT, 20);
    const upKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_UP, 20);
    const downKey = new holdEvent.KeyboardKeyHold(KEYCODE.ARROW_DOWN, 20);
    leftKey.addEventListener("holding", (event) => {
      cameraControls.rotate(
        -0.05 * THREE.MathUtils.DEG2RAD * event?.deltaTime,
        0,
        true
      );
    });
    rightKey.addEventListener("holding", (event) => {
      cameraControls.rotate(
        0.05 * THREE.MathUtils.DEG2RAD * event?.deltaTime,
        0,
        true
      );
    });
    upKey.addEventListener("holding", (event) => {
      cameraControls.rotate(
        0,
        -0.05 * THREE.MathUtils.DEG2RAD * event?.deltaTime,
        true
      );
    });
    downKey.addEventListener("holding", (event) => {
      cameraControls.rotate(
        0,
        0.05 * THREE.MathUtils.DEG2RAD * event?.deltaTime,
        true
      );
    });

    let spaceKeyDownTimestamp: number | null = null;

    const onSpaceKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYCODE.SPACE) {
        spaceKeyDownTimestamp = Date.now();
      }
    };

    const onSpaceKeyUp = (event: KeyboardEvent) => {
      if (event.key === KEYCODE.SPACE && spaceKeyDownTimestamp) {
        const elapsedTime = Date.now() - spaceKeyDownTimestamp;

        // Check if the key press duration is less than a certain threshold (e.g., 200ms) to consider it a click
        if (elapsedTime < 200) {
          // Handle the space bar click event
          if (animationId.current !== null) {
            cancelAnimationFrame(animationId.current);
          }
          animateCamera();
        }
        spaceKeyDownTimestamp = null;
      }
    };

    window.addEventListener("keydown", onSpaceKeyDown);
    window.addEventListener("keyup", onSpaceKeyUp);

    // TODO: we currently don't remove any event listeners. This is a bit messy
    // because KeyboardKeyHold attaches listeners directly to the
    // document/window; it's unclear if we can remove these.
    return () => {
      if (animationId.current !== null) {
        cancelAnimationFrame(animationId.current);
      }
      window.removeEventListener("resize", sendCamera);
      window.removeEventListener("keydown", onSpaceKeyDown);
      window.removeEventListener("keyup", onSpaceKeyUp);
    };
  }, [CameraControls]);

  return (
    <CameraControls
      ref={viewer.cameraControlRef}
      minDistance={0.1}
      maxDistance={200.0}
      dollySpeed={0.3}
      smoothTime={0.0}
      draggingSmoothTime={0.0}
      onChange={sendCamera}
      makeDefault
    />
  );
}
