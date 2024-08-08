/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { React, Text, useState } from "@webpack/common";

import { TransparentButton } from "./components/TransparentButton";

interface TreeNode {
    id: string;
    label: string;
    expanded: boolean;
    expandable?: boolean,
    fetchChildren: () => Promise<TreeNode[]>;
    children?: TreeNode[];
    createExpanded?: boolean;
}

interface TreeViewProps {
    data: TreeNode[];
    selectedNode: string;
    selectNode: Function;
    onContextMenu: Function;
}

interface NodeState {
    id: string;
    expanded: boolean;
}

export const nodeStateStore = {};

const TreeNodeItem: React.FC<{ node: TreeNode, selectedNode: string, selectNode: Function, onContextMenu: Function; }> = ({ node, selectedNode, selectNode, onContextMenu }) => {
    const [expanded, setExpanded] = useState(node.expanded);
    const [loading, setLoading] = useState(false);

    const toggleExpand = async () => {
        if (!expanded) {
            setLoading(true);
            const children = await node.fetchChildren();
            node.children = children;
            setLoading(false);
        }
        node.expanded = !expanded;
        // nodeStateStore[node.id] = {
        //     id: node.id,
        //     expanded: node.expanded,
        // } as NodeState;
        setExpanded(!expanded);
    };
    // if (node.createExpanded === true && node.expanded === true) {
    //     setExpanded(false);
    //     toggleExpand();
    //     node.createExpanded = false;
    // }

    return (
        <div>
            {/* <div onClick={toggleExpand}>
                {expanded ? "▼" : "►"} {node.label}
            </div> */}
            {
                node.expandable === false ?
                    <div style={{ height: "16px" }}></div>
                    :
                    <Text onClick={toggleExpand}>
                        {expanded ? "▼" : "►"}
                    </Text>
            }
            {/* <TransparentButton clickTarget={node} clicked={selectedNode === node.id} onClick={selectNode}> */}
            <TransparentButton isToggle={false} onClick={toggleExpand} onContextMenu={ev => {
                { /* <TransparentButton clickTarget={node} clicked={selectedNode === node.id} onClick={selectNode} onContextMenu={ev => { */ }
                selectNode(node);
                onContextMenu(ev);
            }}>
                {/* <TransparentButton clickTarget={node} clicked={selectedNode === node.id} onClick={console.log}> */}
                <Text style={{
                    marginLeft: "20px",
                    fontSize: "1rem",
                    color: "white",
                    fontWeight: "bold",
                    padding: "5px",
                    borderRadius: "4px",
                    outline: "3px solid #f0f0f0",
                    cursor: "pointer",
                }}>
                    {node.label}
                </Text>
            </TransparentButton>
            {expanded && loading && <div>Loading...</div>}
            {expanded && !loading && node.children && (
                <div style={{ marginLeft: "20px" }}>
                    {node.children.map(childNode => (
                        <TreeNodeItem key={childNode.id} node={childNode} selectedNode={selectedNode} selectNode={selectNode} onContextMenu={onContextMenu} />
                    ))}
                </div>
            )}
        </div>
    );
};

const TreeView: React.FC<TreeViewProps> = ({ data, selectedNode, selectNode, onContextMenu }) => {
    return (
        <div>
            {data.map(node => (
                <TreeNodeItem key={node.id} node={node} selectedNode={selectedNode} selectNode={selectNode} onContextMenu={onContextMenu} />
            ))}
        </div>
    );
};

export default TreeView;
export {
    TreeNode,
};
export function findInTree(root: TreeNode, filter: (x: TreeNode) => boolean): TreeNode | null {
    if (!root) return null;

    if (filter(root)) {
        return root as TreeNode;
    } else {
        if (root.children)
            for (const child of root.children) {
                const result = findInTree(child, filter);
                if (result) return result as TreeNode;
            }
    }

    return null;
}
