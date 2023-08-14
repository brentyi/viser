import * as Messages from "../WebsocketMessages";
import React from "react";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type GuiConfig =
  | Messages.GuiAddButtonMessage
  | Messages.GuiAddCheckboxMessage
  | Messages.GuiAddDropdownMessage
  | Messages.GuiAddFolderMessage
  | Messages.GuiAddTabGroupMessage
  | Messages.GuiAddNumberMessage
  | Messages.GuiAddRgbMessage
  | Messages.GuiAddRgbaMessage
  | Messages.GuiAddSliderMessage
  | Messages.GuiAddButtonGroupMessage
  | Messages.GuiAddTextMessage
  | Messages.GuiAddVector2Message
  | Messages.GuiAddVector3Message
  | Messages.GuiAddMarkdownMessage;

export function isGuiConfig(message: Messages.Message): message is GuiConfig {
  return message.type.startsWith("GuiAdd");
}

interface GuiState {
  theme: Messages.ThemeConfigurationMessage;
  label: string;
  server: string;
  websocketConnected: boolean;
  backgroundAvailable: boolean;
  guiIdSetFromContainerId: {
    [containerId: string]: Set<string> | undefined;
  };
  modals: Messages.GuiModalMessage[];
  guiConfigFromId: { [id: string]: GuiConfig };
  guiValueFromId: { [id: string]: any };
  guiAttributeFromId: {
    [id: string]: { visible?: boolean; disabled?: boolean } | undefined;
  };
}

interface GuiActions {
  setTheme: (theme: Messages.ThemeConfigurationMessage) => void;
  addGui: (config: GuiConfig) => void;
  addModal: (config: Messages.GuiModalMessage) => void;
  removeModal: (id: string) => void;
  setGuiValue: (id: string, value: any) => void;
  setGuiVisible: (id: string, visible: boolean) => void;
  setGuiDisabled: (id: string, visible: boolean) => void;
  removeGui: (id: string) => void;
  resetGui: () => void;
}

const cleanGuiState: GuiState = {
  theme: {
    type: "ThemeConfigurationMessage",
    titlebar_content: null,
    control_layout: "floating",
    dark_mode: false,
    colors: null,
  },
  label: "",
  server: "ws://localhost:8080", // Currently this will always be overridden.
  websocketConnected: false,
  backgroundAvailable: false,
  guiIdSetFromContainerId: {},
  modals: [],
  guiConfigFromId: {},
  guiValueFromId: {},
  guiAttributeFromId: {},
};

export function useGuiState(initialServer: string) {
  return React.useState(() =>
    create(
      immer<GuiState & GuiActions>((set) => ({
        ...cleanGuiState,
        server: initialServer,
        setTheme: (theme) =>
          set((state) => {
            state.theme = theme;
          }),
        addGui: (guiConfig) =>
          set((state) => {
            state.guiConfigFromId[guiConfig.id] = guiConfig;
            state.guiIdSetFromContainerId[guiConfig.container_id] = new Set(
              state.guiIdSetFromContainerId[guiConfig.container_id],
            ).add(guiConfig.id);
          }),
        addModal: (modalConfig) =>
          set((state) => {
            state.modals.push(modalConfig);
          }),
        removeModal: (id) =>
          set((state) => {
            state.modals = state.modals.filter((m) => m.id !== id);
          }),
        setGuiValue: (id, value) =>
          set((state) => {
            state.guiValueFromId[id] = value;
          }),
        setGuiVisible: (id, visible) =>
          set((state) => {
            state.guiAttributeFromId[id] = {
              ...state.guiAttributeFromId[id],
              visible: visible,
            };
          }),
        setGuiDisabled: (id, disabled) =>
          set((state) => {
            state.guiAttributeFromId[id] = {
              ...state.guiAttributeFromId[id],
              disabled: disabled,
            };
          }),
        removeGui: (id) =>
          set((state) => {
            const guiConfig = state.guiConfigFromId[id];

            state.guiIdSetFromContainerId[guiConfig.container_id]!.delete(
              guiConfig.id,
            );
            delete state.guiConfigFromId[id];
            delete state.guiValueFromId[id];
            delete state.guiAttributeFromId[id];
          }),
        resetGui: () =>
          set((state) => {
            state.guiIdSetFromContainerId = {};
            state.guiConfigFromId = {};
            state.guiValueFromId = {};
            state.guiAttributeFromId = {};
          }),
      })),
    ),
  )[0];
}

/** Type corresponding to a zustand-style useGuiState hook. */
export type UseGui = ReturnType<typeof useGuiState>;
