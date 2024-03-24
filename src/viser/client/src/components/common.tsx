import * as React from "react";
import { Box, Flex, Text, NumberInput, Tooltip } from "@mantine/core";
import { GuiComponentContext } from "../ControlPanel/GuiComponentContext";

export function ViserInputComponent({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  children: React.ReactNode;
  label?: string;
  hint?: string | null;
}) {
  const { folderDepth } = React.useContext(GuiComponentContext)!;
  if (hint !== undefined && hint !== null) {
    children = // We need to add <Box /> for inputs that we can't assign refs to.
      (
        <Tooltip
          zIndex={100}
          label={hint}
          multiline
          w="15rem"
          withArrow
          openDelay={500}
          withinPortal
        >
          <Box>{children}</Box>
        </Tooltip>
      );
  }

  if (label !== undefined)
    children = (
      <LabeledInput
        id={id}
        label={label}
        input={children}
        folderDepth={folderDepth}
      />
    );

  return (
    <Box pb="0.5em" px="xs">
      {children}
    </Box>
  );
}

/** GUI input with a label horizontally placed to the left of it. */
function LabeledInput(props: {
  id: string;
  label: string;
  input: React.ReactNode;
  folderDepth: number;
}) {
  return (
    <Flex align="center">
      <Box
        // The per-layer offset here is just eyeballed.
        w={`${7.25 - props.folderDepth * 0.6375}em`}
        pr="xs"
        style={{ flexShrink: 0, position: "relative" }}
      >
        <Text
          c="dimmed"
          fz="0.875em"
          fw="450"
          lh="1.375em"
          lts="-0.75px"
          unselectable="off"
          style={{
            width: "100%",
            boxSizing: "content-box",
          }}
        >
          <label htmlFor={props.id}>{props.label}</label>
        </Text>
      </Box>
      <Box style={{ flexGrow: 1 }}>{props.input}</Box>
    </Flex>
  );
}

export function VectorInput(
  props:
    | {
        id: string;
        n: 2;
        value: [number, number];
        min: [number, number] | null;
        max: [number, number] | null;
        step: number;
        precision: number;
        onChange: (value: number[]) => void;
        disabled: boolean;
      }
    | {
        id: string;
        n: 3;
        value: [number, number, number];
        min: [number, number, number] | null;
        max: [number, number, number] | null;
        step: number;
        precision: number;
        onChange: (value: number[]) => void;
        disabled: boolean;
      },
) {
  return (
    <Flex justify="space-between" columnGap="0.5em">
      {[...Array(props.n).keys()].map((i) => (
        <NumberInput
          id={i === 0 ? props.id : undefined}
          key={i}
          value={props.value[i]}
          onChange={(v) => {
            const updated = [...props.value];
            updated[i] = v === "" ? 0.0 : Number(v);
            props.onChange(updated);
          }}
          size="xs"
          styles={{
            root: { flexGrow: 1, width: 0 },
            input: {
              paddingLeft: "0.5em",
              paddingRight: "1.75em",
              textAlign: "right",
              height: "1.875em",
              minHeight: "1.875em",
            },
            controls: {
              height: "1.875em",
            },
            control: {
              width: "1.2em",
              height: "0.2em",
            },
          }}
          rightSectionWidth="1em"
          // precision={props.precision}
          step={props.step}
          min={props.min === null ? undefined : props.min[i]}
          max={props.max === null ? undefined : props.max[i]}
          stepHoldDelay={500}
          stepHoldInterval={(t) => Math.max(1000 / t ** 2, 25)}
          disabled={props.disabled}
        />
      ))}
    </Flex>
  );
}
