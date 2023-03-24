import { decode } from "@msgpack/msgpack";
import AwaitLock from "await-lock";
import React, { MutableRefObject, RefObject } from "react";
import * as THREE from "three";
import { TextureLoader } from "three";
import { UseGui } from "./ControlPanel/GuiState";

import { SceneNode, UseSceneTree } from "./SceneTree";
import { CoordinateFrame, CameraFrustum } from "./ThreeAssets";
import { Message } from "./WebsocketMessages";

/** React hook for handling incoming messages, and using them for scene tree manipulation. */
function useMessageHandler(
  useSceneTree: UseSceneTree,
  useGui: UseGui,
  wrapperRef: RefObject<HTMLDivElement>
) {
  const removeSceneNode = useSceneTree((state) => state.removeSceneNode);
  const resetScene = useSceneTree((state) => state.resetScene);
  const addSceneNode = useSceneTree((state) => state.addSceneNode);
  const addGui = useGui((state) => state.addGui);
  const removeGui = useGui((state) => state.removeGui);
  const guiSet = useGui((state) => state.guiSet);
  const setVisibility = useSceneTree((state) => state.setVisibility);

  // Same as addSceneNode, but make a parent in the form of a dummy coordinate
  // frame if it doesn't exist yet.
  function addSceneNodeMakeParents(node: SceneNode) {
    const nodeFromName = useSceneTree.getState().nodeFromName;
    const parent_name = node.name.split("/").slice(0, -1).join("/");
    if (!(parent_name in nodeFromName)) {
      console.log("remaking parent", parent_name);
      addSceneNodeMakeParents(
        new SceneNode(parent_name, (ref) => (
          <CoordinateFrame ref={ref} show_axes={false} />
        ))
      );
    }
    addSceneNode(node);
  }

  // Return message handler.
  return (message: Message) => {
    switch (message.type) {
      // Add a coordinate frame.
      case "frame": {
        addSceneNodeMakeParents(
          new SceneNode(message.name, (ref) => (
            <CoordinateFrame
              ref={ref}
              scale={message.scale}
              position={new THREE.Vector3().fromArray(message.position)}
              quaternion={
                new THREE.Quaternion(
                  message.wxyz[1],
                  message.wxyz[2],
                  message.wxyz[3],
                  message.wxyz[0]
                )
              }
              show_axes={message.show_axes}
            />
          ))
        );
        break;
      }
      // Add a point cloud.
      case "point_cloud": {
        const geometry = new THREE.BufferGeometry();
        const pointCloudMaterial = new THREE.PointsMaterial({
          size: message.point_size,
          vertexColors: true,
        });

        // Reinterpret cast: uint8 buffer => float32 for positions.
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            new Float32Array(
              message.position.buffer.slice(
                message.position.byteOffset,
                message.position.byteOffset + message.position.byteLength
              )
            ),
            3
          )
        );
        geometry.computeBoundingSphere();

        // Wrap uint8 buffer for colors. Note that we need to set normalized=true.
        geometry.setAttribute(
          "color",
          new THREE.Uint8BufferAttribute(message.color, 3, true)
        );

        addSceneNodeMakeParents(
          new SceneNode(message.name, (ref) => (
            <points
              ref={ref}
              geometry={geometry}
              material={pointCloudMaterial}
            />
          ))
        );
        break;
      }
      // Add mesh
      case "mesh": {
        const geometry = new THREE.BufferGeometry();
        // TODO(hangg): Should expose color as well.
        const material = new THREE.MeshStandardMaterial({ color: 0x00e8fc });
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            new Float32Array(
              message.vertices.buffer.slice(
                message.vertices.byteOffset,
                message.vertices.byteOffset + message.vertices.byteLength
              )
            ),
            3
          )
        );
        geometry.setIndex(
          new THREE.Uint32BufferAttribute(
            new Uint32Array(
              message.faces.buffer.slice(
                message.faces.byteOffset,
                message.faces.byteOffset + message.faces.byteLength
              )
            ),
            1
          )
        );
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        addSceneNode(
          new SceneNode(message.name, (ref) => (
            <mesh ref={ref} geometry={geometry} material={material} />
          ))
        );
        break;
      }
      // Add a camera frustum.
      case "camera_frustum": {
        addSceneNodeMakeParents(
          new SceneNode(message.name, (ref) => (
            <CameraFrustum
              ref={ref}
              fov={message.fov}
              aspect={message.aspect}
              scale={message.scale}
            ></CameraFrustum>
          ))
        );
        break;
      }
      // Add a background image.
      case "background_image": {
        if (wrapperRef.current != null) {
          wrapperRef.current.style.backgroundImage = `url(data:${message.media_type};base64,${message.base64_data})`;
          wrapperRef.current.style.backgroundSize = "cover";
          wrapperRef.current.style.backgroundRepeat = "no-repeat";
          wrapperRef.current.style.backgroundPosition = "center center";

          useGui.setState({ backgroundAvailable: true });
        }
        break;
      }
      // Add an image.
      case "image": {
        // It's important that we load the texture outside of the node
        // construction callback; this prevents flickering by ensuring that the
        // texture is ready before the scene tree updates.
        const colorMap = new TextureLoader().load(
          `data:${message.media_type};base64,${message.base64_data}`
        );
        addSceneNodeMakeParents(
          new SceneNode(message.name, (ref) => {
            return (
              <mesh ref={ref}>
                <planeGeometry
                  attach="geometry"
                  args={[message.render_width, message.render_height]}
                />
                <meshBasicMaterial
                  attach="material"
                  transparent={true}
                  side={THREE.DoubleSide}
                  map={colorMap}
                />
              </mesh>
            );
          })
        );
        break;
      }
      // Remove a scene node by name.
      case "remove_scene_node": {
        console.log("Removing scene node:", message.name);
        removeSceneNode(message.name);
        break;
      }
      // Set the visibility of a particular scene node.
      case "set_scene_node_visibility": {
        setVisibility(message.name, message.visible);
        break;
      }
      // Reset the entire scene, removing all scene nodes.
      case "reset_scene": {
        console.log("Resetting scene!");
        resetScene();
        wrapperRef.current!.style.backgroundImage = "none";

        useGui.setState({ backgroundAvailable: false });
        break;
      }
      // Add a GUI input.
      case "add_gui": {
        addGui(message.name, {
          levaConf: message.leva_conf,
          folderName: message.folder,
        });
        break;
      }
      // Set the value of a GUI input.
      case "gui_set": {
        guiSet(message.name, message.value);
        break;
      }
      // Add a GUI input.
      case "gui_set_leva_conf": {
        const currentConf = useGui.getState().guiConfigFromName[message.name];
        if (currentConf !== undefined) {
          addGui(message.name, {
            levaConf: message.leva_conf,
            folderName: currentConf.folderName,
          });
        }
        break;
      }
      // Remove a GUI input.
      case "remove_gui": {
        removeGui(message.name);
        break;
      }
      default: {
        console.log("Received message did not match any known types:", message);
        break;
      }
    }
  };
}

interface WebSocketInterfaceProps {
  useSceneTree: UseSceneTree;
  useGui: UseGui;
  websocketRef: MutableRefObject<WebSocket | null>;
  wrapperRef: RefObject<HTMLDivElement>;
}

/** Component for handling websocket connections. */
export default function WebsocketInterface(props: WebSocketInterfaceProps) {
  const handleMessage = useMessageHandler(
    props.useSceneTree,
    props.useGui,
    props.wrapperRef
  );

  const server = props.useGui((state) => state.server);
  const resetGui = props.useGui((state) => state.resetGui);

  React.useEffect(() => {
    // Lock for making sure messages are handled in order.
    const orderLock = new AwaitLock();

    let ws: null | WebSocket = null;
    let done = false;

    function tryConnect(): void {
      if (done) return;

      ws = new WebSocket(server);

      ws.onopen = () => {
        console.log("Connected!" + server);
        props.websocketRef.current = ws;
        props.useGui.setState({ websocketConnected: true });
      };

      ws.onclose = () => {
        console.log("Disconnected! " + server);
        props.websocketRef.current = null;
        props.useGui.setState({ websocketConnected: false });
        if (props.useGui.getState().guiNames.length > 0) resetGui();

        // Try to reconnect.
        timeout = setTimeout(tryConnect, 1000);
      };

      ws.onmessage = async (event) => {
        // Async message handler. This is structured to reduce websocket
        // backpressure.
        const messagePromise = new Promise<Message>(async (resolve) => {
          resolve(decode(await event.data.arrayBuffer()) as Message);
        });

        // Handle messages in order.
        await orderLock.acquireAsync();
        try {
          handleMessage(await messagePromise);
        } finally {
          orderLock.release();
        }
      };
    }

    let timeout = setTimeout(tryConnect, 500);
    return () => {
      done = true;
      clearTimeout(timeout);
      props.useGui.setState({ websocketConnected: false });
      ws && ws.close();
      clearTimeout(timeout);
    };
  }, [props, server, handleMessage, resetGui]);

  return <></>;
}
