import { unpack } from "msgpackr";
import { Message } from "./WebsocketMessages";
import React, { useContext, useEffect } from "react";
import { ViewerContext } from "./App";

interface SerializedMessages {
  loopStartIndex: number | null;
  durationSeconds: number;
  messages: [number, Message][];
}

async function deserializeMsgpackFile<T>(fileUrl: string): Promise<T> {
  // Fetch the file using fetch()
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch the file: ${response.statusText}`);
  }
  return new Promise<T>((resolve) => {
    let length = 0;
    const buffer: Uint8Array[] = [];
    response.body!.pipeThrough(new DecompressionStream("gzip")).pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          buffer.push(chunk);
          length += chunk.length;
        },
        close() {
          const output = new Uint8Array(length);
          let offset = 0;
          for (const chunk of buffer) {
            output.set(chunk, offset);
            offset += chunk.length;
          }
          console.log(output.length);
          resolve(unpack(output));
        },
        abort(err) {
          console.error("Stream aborted:", err);
        },
      }),
    );
  });
}

export function PlaybackFromFile({ fileUrl }: { fileUrl: string }) {
  const viewer = useContext(ViewerContext)!;
  const messageQueueRef = viewer.messageQueueRef;

  useEffect(() => {
    deserializeMsgpackFile<SerializedMessages>(fileUrl).then((recording) => {
      let messageIndex = 0;

      function continuePlayback() {
        const currentTimeSeconds = recording.messages[messageIndex][0];
        while (currentTimeSeconds >= recording.messages[messageIndex][0]) {
          messageQueueRef.current.push(recording.messages[messageIndex][1]);
          messageIndex += 1;

          // Either finish playback or loop.
          if (messageIndex === recording.messages.length) {
            if (recording.loopStartIndex === null) return;
            messageIndex = recording.loopStartIndex;
            setTimeout(
              continuePlayback,
              (recording.durationSeconds - currentTimeSeconds) * 1000.0,
            );
            return;
          }
        }

        // Handle next set of frames.
        setTimeout(
          continuePlayback,
          (recording.messages[messageIndex][0] - currentTimeSeconds) * 1000.0,
        );
      }
      setTimeout(continuePlayback, recording.messages[0][0] * 1000.0);
    });
  });

  // useFrame(() => {
  //   const currentState = state.current;
  //   if (currentState === null) return;
  //
  //   // Get seconds elapsed since start. We offset by the first message's
  //   // timestamp.
  //   const elapsedSeconds = Date.now() / 1000.0 - currentState.startTimeSeconds;
  //
  //   // Handle messages.
  //   while (
  //     currentState.index < currentState.loaded.messages.length &&
  //     currentState.loaded.messages[currentState.index][0] <= elapsedSeconds
  //   ) {
  //     const msg = currentState.loaded.messages[currentState.index][1];
  //     messageQueueRef.current.push(msg);
  //     currentState.index += 1;
  //   }
  //
  //   // Reset if looping.
  //   if (
  //     currentState.loaded.loopStartIndex !== null &&
  //     elapsedSeconds >= currentState.loaded.durationSeconds
  //   ) {
  //     currentState.index = currentState.loaded.loopStartIndex;
  //     currentState.startTimeSeconds =
  //       Date.now() / 1000.0 -
  //       currentState.loaded.messages[currentState.index][0];
  //     return;
  //   }
  // });

  return <></>;
}
