import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LogEntry, LogLevel } from "../../electron/main/consoleLogger.js";
import { ExplorerItem } from "../../electron/main/router/app.js";
import { State } from "../../electron/main/types.js";
import { BlueScreenOfDeath } from "../design-system/BlueScreenOfDeath.js";
import { Breadcrumbs } from "../design-system/Breadcrumbs.js";
import { LeftResizableWidget } from "../design-system/LeftResizableWidget.js";
import { RightResizableWidget } from "../design-system/RightResizableWidget.js";
import { ScrollableArea } from "../design-system/ScrollableArea.js";
import { SpinnerLoader } from "../design-system/SpinnerLoader.js";
import { TopResizableWidget } from "../design-system/TopResizableWidget.js";
import { TreeMenu, TreeMenuItem } from "../design-system/TreeMenu.js";
import { ResourceIcon } from "../stories/utils.js";
import { trpc } from "../utils/trpc.js";
import { useTreeMenuItems } from "../utils/useTreeMenuItems.js";

import { ConsoleFilters } from "./ConsoleFilters.js";
import { ConsoleLogs } from "./ConsoleLogs.js";
import { ElkMap } from "./elk-map/ElkMap.js";
import { ContainerNode } from "./ElkMapNodes.js";
import { MetadataPanel } from "./MetadataPanel.js";
import { StatusBar } from "./StatusBar.js";

export interface VscodeLayoutProps {
  cloudAppState: State;
  wingVersion: string | undefined;
}

export const VscodeLayout = ({
  cloudAppState,
  wingVersion,
}: VscodeLayoutProps) => {
  const treeMenu = useTreeMenuItems();

  const errorMessage = trpc["app.error"].useQuery();
  const explorerTree = trpc["app.explorerTree"].useQuery();
  useEffect(() => {
    if (explorerTree.data) {
      treeMenu.setItems([
        createTreeMenuItemFromExplorerTreeItem(explorerTree.data),
      ]);
      treeMenu.setCurrent("root");
    }
  }, [explorerTree.data]);

  useEffect(() => {
    treeMenu.expandAll();
  }, [treeMenu.items]);

  const [selectedLogTypeFilters, setSelectedLogTypeFilters] = useState<
    LogLevel[]
  >(["info", "warn", "error"]);
  const [searchText, setSearchText] = useState("");

  const [logsTimeFilter, setLogsTimeFilter] = useState(0);
  const clearLogs = () => {
    setLogsTimeFilter(Date.now());
  };

  const logs = trpc["app.logs"].useQuery(
    {
      filters: {
        level: {
          verbose: selectedLogTypeFilters.includes("verbose"),
          info: selectedLogTypeFilters.includes("info"),
          warn: selectedLogTypeFilters.includes("warn"),
          error: selectedLogTypeFilters.includes("error"),
        },
        source: {
          compiler: true,
          console: true,
          simulator: true,
        },
        text: searchText,
        timestamp: logsTimeFilter,
      },
    },
    {
      keepPreviousData: true,
    },
  );

  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const div = logsRef.current;
    if (div) {
      div.scrollTo({ top: div.scrollHeight });
    }

    if (!logs.data) {
      return;
    }
  }, [logs.data]);

  const onLogSelected = (log: LogEntry) => {
    const path = log.ctx?.sourcePath;
    if (path) {
      treeMenu.setCurrent(path);
    }
  };

  const metadata = trpc["app.nodeMetadata"].useQuery(
    {
      path: treeMenu.currentItemId,
    },
    {
      enabled: !!treeMenu.currentItemId,
    },
  );

  const isLoading = useMemo(() => {
    return cloudAppState === "loading" || explorerTree.isLoading;
  }, [explorerTree, cloudAppState]);

  const map = trpc["app.map"].useQuery();
  const mapRefs = useRef<{ [key: string]: HTMLElement | undefined }>({});
  useEffect(() => {
    if (!treeMenu.currentItemId) {
      return;
    }

    const element = mapRefs.current[treeMenu.currentItemId];
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }, [treeMenu.currentItemId]);

  return (
    <div
      data-testid="vscode-layout"
      className="h-full flex flex-col bg-slate-50 select-none"
    >
      <div className="flex-1 flex relative">
        {isLoading && (
          <div className="absolute bg-white bg-opacity-70 h-full w-full z-50">
            <div className=" absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
              <SpinnerLoader />
            </div>
          </div>
        )}

        <BlueScreenOfDeath
          hidden={cloudAppState !== "error"}
          title={"An error has occurred:"}
          error={errorMessage.data ?? ""}
        />

        <RightResizableWidget className="h-full flex flex-col w-80 min-w-[10rem] min-h-[15rem] border-r border-slate-200">
          <TreeMenu
            title="Explorer"
            items={treeMenu.items}
            selectedItemId={treeMenu.currentItemId}
            openMenuItemIds={treeMenu.openItemIds}
            onItemClick={(item) => {
              treeMenu.setCurrent(item.id);
            }}
            onItemToggle={(item) => {
              treeMenu.toggle(item.id);
            }}
            onExpandAll={() => treeMenu.expandAll()}
            onCollapseAll={() => treeMenu.collapseAll()}
            disabled={isLoading}
          />
        </RightResizableWidget>

        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex">
            <div className="flex-1 flex flex-col">
              <div className="flex-shrink-0 h-9 bg-gray-50"></div>
              <div className="h-full relative">
                <ScrollableArea overflowX overflowY className="bg-white">
                  <div
                    data-testid="map-view"
                    className="min-h-full flex justify-around items-center"
                  >
                    {map.data && (
                      <ElkMap
                        nodes={map.data.nodes}
                        edges={map.data.edges}
                        selectedNodeId={treeMenu.currentItemId}
                        onSelectedNodeIdChange={(id) => {
                          treeMenu.setCurrent(id);
                        }}
                        node={({ node }) => (
                          <div
                            ref={(element) =>
                              (mapRefs.current[node.id] = element || undefined)
                            }
                            className="h-full flex flex-col relative"
                          >
                            <ContainerNode
                              name={node.data?.label}
                              open={node.children && node.children?.length > 0}
                              selected={node.id === treeMenu.currentItemId}
                              resourceType={node.data?.type}
                              icon={(props) => (
                                <ResourceIcon
                                  resourceType={node.data?.type}
                                  solid
                                  {...props}
                                />
                              )}
                            />
                          </div>
                        )}
                      />
                    )}
                  </div>
                </ScrollableArea>
              </div>
            </div>

            <LeftResizableWidget className="bg-white flex-shrink w-80 min-w-[10rem] border-l z-10">
              {metadata.data && (
                <MetadataPanel
                  node={metadata.data.node}
                  inbound={metadata.data.inbound}
                  outbound={metadata.data.outbound}
                  onConnectionNodeClick={(path) => {
                    treeMenu.expand(path);
                    treeMenu.setCurrent(path);
                  }}
                />
              )}
            </LeftResizableWidget>
          </div>
        </div>
      </div>
      {cloudAppState !== "error" && (
        <TopResizableWidget className="border-t bg-white min-h-[5rem] h-[12rem] pt-1.5">
          <div className="relative h-full flex flex-col gap-2">
            {isLoading && (
              <div className="absolute bg-white bg-opacity-70 h-full w-full z-50" />
            )}
            <ConsoleFilters
              selectedLogTypeFilters={selectedLogTypeFilters}
              setSelectedLogTypeFilters={setSelectedLogTypeFilters}
              clearLogs={clearLogs}
              isLoading={isLoading}
              onSearch={setSearchText}
            />
            <div className="relative h-full">
              <ScrollableArea ref={logsRef} overflowY className="px-4 pb-1.5">
                <ConsoleLogs
                  logs={logs.data ?? []}
                  onLogSelected={onLogSelected}
                />
              </ScrollableArea>
            </div>
          </div>
        </TopResizableWidget>
      )}

      <StatusBar
        wingVersion={wingVersion}
        cloudAppState={cloudAppState}
        isError={cloudAppState === "error"}
      />
    </div>
  );
};

function createTreeMenuItemFromExplorerTreeItem(
  item: ExplorerItem,
): TreeMenuItem {
  return {
    id: item.id,
    label: item.label,
    icon: item.type ? (
      <ResourceIcon
        resourceType={item.type}
        className="w-4 h-4"
        darkenOnGroupHover
      />
    ) : undefined,
    children: item.childItems?.map((item) =>
      createTreeMenuItemFromExplorerTreeItem(item),
    ),
  };
}
