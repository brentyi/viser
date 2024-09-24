import { Box, Text } from "@mantine/core";
import Markdown from "../Markdown";
import { ErrorBoundary } from "react-error-boundary";
import { GuiMarkdownMessage } from "../WebsocketMessages";

export default function MarkdownComponent({
  props: { visible, markdown },
}: GuiMarkdownMessage) {
  if (!visible) return <></>;
  return (
    <Box pb="xs" px="sm" style={{ maxWidth: "95%" }}>
      <ErrorBoundary
        fallback={<Text ta="center">Markdown Failed to Render</Text>}
      >
        <Markdown>{markdown}</Markdown>
      </ErrorBoundary>
    </Box>
  );
}
