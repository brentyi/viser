import { style } from "@vanilla-extract/css";
import { vars } from "../AppTheme";

export const tableWrapper = style({
  border: "1px solid",
  borderColor: vars.colors.defaultBorder,
  borderRadius: vars.radius.xs,
  padding: "0.1em 0",
  overflowX: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "0",
});

export const caretIcon = style({
  opacity: 0.5,
  height: "1em",
  width: "1em",
  transform: "translateY(0.1em)",
});

export const tableRow = style({
  display: "flex",
  alignItems: "center",
  gap: "0.2em",
  padding: "0 0.25em",
  lineHeight: "2em",
  fontSize: "0.875em",
});
