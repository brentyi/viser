import * as React from "react";
import { GuiAddTabGroupMessage } from "../WebsocketMessages";
import { Tabs, TabsValue } from "@mantine/core";
import { Image } from "@mantine/core";
import { GuiComponentContext } from "../ControlPanel/GuiComponentContext";

export default function TabGroupComponent({
  tab_labels,
  tab_icons_base64,
  tab_container_ids,
  visible,
}: GuiAddTabGroupMessage) {
  const [tabState, setTabState] = React.useState<TabsValue>("0");
  const icons = tab_icons_base64;
  const { GuiContainer } = React.useContext(GuiComponentContext)!;
  if (!visible) return <></>;
  return (
    <Tabs
      radius="xs"
      value={tabState}
      onTabChange={setTabState}
      sx={{ marginTop: "-0.75em" }}
    >
      <Tabs.List>
        {tab_labels.map((label, index) => (
          <Tabs.Tab
            value={index.toString()}
            key={index}
            icon={
              icons[index] === null ? undefined : (
                <Image
                  /*^In Safari, both the icon's height and width need to be set, otherwise the icon is clipped.*/
                  height={"1.125em"}
                  width={"1.125em"}
                  sx={(theme) => ({
                    filter:
                      theme.colorScheme == "dark" ? "invert(1)" : undefined,
                  })}
                  src={"data:image/svg+xml;base64," + icons[index]}
                />
              )
            }
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tab_container_ids.map((containerId, index) => (
        <Tabs.Panel value={index.toString()} key={containerId}>
          <GuiContainer containerId={containerId} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
