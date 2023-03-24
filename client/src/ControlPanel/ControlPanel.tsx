import { TreeView } from "@mui/lab";
import Tabs from "@mui/material/Tabs";
import Box from "@mui/material/Box";
import React, { MutableRefObject, RefObject } from "react";
import styled from "@emotion/styled";
import Tab from "@mui/material/Tab";
import { UseSceneTree } from "../SceneTree";
import {
  ExpandLessRounded,
  SensorsRounded,
  SensorsOffRounded,
} from "@mui/icons-material";
import { UseGui } from "./GuiState";
import GeneratedControls from "./Generated";
import ServerControls from "./Server";
import { SceneNodeUI } from "./SceneTreeUI";

interface ConnectedStatusProps {
  useGui: UseGui;
}

/* Icon and label telling us the current status of the websocket connection. */
function ConnectionStatus(props: ConnectedStatusProps) {
  const connected = props.useGui((state) => state.websocketConnected);
  const server = props.useGui((state) => state.server);
  const label = props.useGui((state) => state.label);

  const StatusIcon = connected ? SensorsRounded : SensorsOffRounded;
  return (
    <>
      <StatusIcon
        htmlColor={connected ? "#0b0" : "#b00"}
        style={{ transform: "translateY(0.25em) scale(1.2)" }}
      />
      &nbsp; &nbsp;
      {label === "" ? server : label}
    </>
  );
}

interface ControlPanelProps {
  useSceneTree: UseSceneTree;
  useGui: UseGui;
  websocketRef: MutableRefObject<WebSocket | null>;
  wrapperRef: RefObject<HTMLDivElement>;
}

/** Root component for control panel. Parents a set of control tabs.
 * This could be refactored+cleaned up a lot! */
export default function ControlPanel(props: ControlPanelProps) {
  const ControlPanelWrapper = styled(Box)`
    box-sizing: border-box;
    width: 20em;
    z-index: 1;
    position: absolute;
    top: 1em;
    right: 1em;
    margin: 0;
    border-radius: 0.5em;
    max-height: 90%;
    overflow: auto;
    background-color: rgba(255, 255, 255, 0.9);
    box-sizing: border-box;
  `;

  const ControlPanelHandle = styled(Box)`
    line-height: 1.5em;
    cursor: pointer;
    position: relative;
    font-weight: 400;
    color: #777;
    box-sizing: border-box;
    overflow: hidden;
    user-select: none;
  `;

  const panelWrapperRef = React.useRef<HTMLDivElement>();

  const showGenerated = props.useGui((state) => state.guiNames.length > 0);

  // Things to track for dragging.
  const dragInfo = React.useRef({
    dragging: false,
    startPosX: 0,
    startPosY: 0,
    startClientX: 0,
    startClientY: 0,
  });

  // Logic for "fixing" panel locations, which keeps the control panel within
  // the bounds of the parent div.
  const unfixedLoc = React.useRef<{ x?: number; y?: number }>({});
  const setPanelLocation = React.useCallback(
    (x: number, y: number) => {
      const panel = panelWrapperRef.current!;
      const parent = panel.parentElement!;

      let newX = x;
      let newY = y;
      newX = Math.min(newX, parent.clientWidth - panel.clientWidth - 10);
      newX = Math.max(newX, 10);
      newY = Math.min(newY, parent.clientHeight - panel.clientHeight - 10);
      newY = Math.max(newY, 10);

      panel.style.top = newY.toString() + "px";
      panel.style.left = newX.toString() + "px";

      return [newX, newY];
    },
    [panelWrapperRef, unfixedLoc]
  );

  // Fix locations on resize.
  React.useEffect(() => {
    const panel = panelWrapperRef.current!;
    const parent = panel.parentElement!;
    const observer = new ResizeObserver(() => {
      if (unfixedLoc.current.x === undefined) {
        unfixedLoc.current.x = panel.offsetLeft;
        unfixedLoc.current.y = panel.offsetTop;
      }
      setPanelLocation(unfixedLoc.current.x!, unfixedLoc.current.y!);
    });
    observer.observe(panel);
    observer.observe(parent);
    return () => {
      observer.disconnect();
    };
  });

  return (
    <ControlPanelWrapper
      sx={{
        border: "1px solid",
        borderColor: "divider",
        "&.hidden": {
          overflow: "hidden",
        },
        "& .panel-contents": {
          opacity: "1.0",
          visibility: "visible",
          height: "auto",
          transition: "visibility 0.2s linear,opacity 0.2s linear",
        },
        "&.hidden .panel-contents": {
          opacity: "0.0",
          visibility: "hidden",
          height: "0 !important",
          border: "0",
          overflow: "hidden",
        },
        "& .expand-icon": {
          transform: "rotate(0)",
        },
        "&.hidden .expand-icon": {
          transform: "rotate(180deg)",
        },
      }}
      ref={panelWrapperRef}
    >
      <ControlPanelHandle
        onClick={() => {
          const state = dragInfo.current;
          if (state.dragging) {
            state.dragging = false;
            return;
          }

          const wrapper = panelWrapperRef.current!;
          if (wrapper.classList.contains("hidden")) {
            wrapper.classList.remove("hidden");
          } else {
            wrapper.classList.add("hidden");
          }
        }}
        onMouseDown={(event) => {
          const state = dragInfo.current;
          const panel = panelWrapperRef.current!;
          state.startClientX = event.clientX;
          state.startClientY = event.clientY;
          state.startPosX = panel.offsetLeft;
          state.startPosY = panel.offsetTop;

          function dragListener(event: MouseEvent) {
            // Minimum motion.
            const deltaX = event.clientX - state.startClientX;
            const deltaY = event.clientY - state.startClientY;
            if (Math.abs(deltaX) <= 3 && Math.abs(deltaY) <= 3) return;

            state.dragging = true;
            let newX = state.startPosX + deltaX;
            let newY = state.startPosY + deltaY;
            [unfixedLoc.current.x, unfixedLoc.current.y] = setPanelLocation(
              newX,
              newY
            );
          }
          window.addEventListener("mousemove", dragListener);
          window.addEventListener(
            "mouseup",
            () => {
              window.removeEventListener("mousemove", dragListener);
            },
            { once: true }
          );
        }}
      >
        <Box
          component="div"
          sx={{
            padding: "0.2em 3em 0.5em 1em",
          }}
        >
          <ConnectionStatus useGui={props.useGui} />
        </Box>
        <Box
          component="div"
          sx={{
            position: "absolute",
            top: "50%",
            right: "1em",
            transform: "translateY(-48%) scale(1.2)",
            height: "1.5em",
          }}
        >
          <ExpandLessRounded color="action" className="expand-icon" />
        </Box>
      </ControlPanelHandle>
      <Box
        component="div"
        sx={{
          borderTop: "1px solid",
          borderTopColor: "divider",
        }}
        className="panel-contents"
      >
        <ControlPanelContents
          tab_labels={
            showGenerated ? ["Control", "Server", "Scene"] : ["Server", "Scene"]
          }
        >
          {showGenerated ? (
            <Box component="div" sx={{ padding: "0.5em 0.5em 1em 0.5em" }}>
              <GeneratedControls
                useGui={props.useGui}
                websocketRef={props.websocketRef}
              />
            </Box>
          ) : null}
          <Box component="div" sx={{ padding: "0.5em" }}>
            <ServerControls
              useGui={props.useGui}
              wrapperRef={props.wrapperRef}
            />
          </Box>
          <TreeView
            sx={{
              padding: "1em 2em 1em 1em",
            }}
          >
            <SceneNodeUI name="" useSceneTree={props.useSceneTree} />
          </TreeView>
        </ControlPanelContents>
      </Box>
    </ControlPanelWrapper>
  );
}

interface ControlPanelTabContentsProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

/** One tab in the control panel. */
function ControlPanelTabContents(props: ControlPanelTabContentsProps) {
  const { children, value, index, ...other } = props;

  return (
    <Box
      component="div"
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      sx={{
        overflow: "auto",
        backgroundColor: "#fff",
      }}
      {...other}
    >
      {children}
    </Box>
  );
}

interface ControlPanelContentsProps {
  children?: React.ReactNode;
  tab_labels: string[];
}

/** Wrapper for tabulated control panel interface. */
function ControlPanelContents(props: ControlPanelContentsProps) {
  const [tabState, setTabState] = React.useState(0);
  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabState(newValue);
  };
  const arrayChildren = React.Children.toArray(props.children);

  // Our wrapper box needs a component prop set for type inference; the
  // typescript compiler will complain without it.
  return (
    <>
      <Box
        component="div"
        sx={{
          paddingLeft: "1em",
          paddingRight: "1em",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Tabs
          value={tabState}
          onChange={handleChange}
          sx={{ minHeight: "45px", height: "45px" }}
        >
          {props.tab_labels.map((value, index) => {
            return (
              <Tab
                label={value}
                key={index}
                sx={{ fontSize: "0.75em", minHeight: "45px", height: "45px" }}
              />
            );
          })}
        </Tabs>
      </Box>

      {arrayChildren.map((child, index) => (
        <ControlPanelTabContents value={tabState} index={index} key={index}>
          {child}
        </ControlPanelTabContents>
      ))}
    </>
  );
}
