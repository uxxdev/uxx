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

import ErrorBoundary from "@components/ErrorBoundary";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal, ModalSize } from "@utils/modal";
import { OptionType, Plugin } from "@utils/types";
import { Button, React } from "@webpack/common";

import { PLUGIN_NAME } from "./constants.js";
import { getGlobalApi } from "./fakeBdApi.js";
import { arrayToObject, createTextForm } from "./utils.js";
import { PluginMeta } from "~plugins";
import { DetailedReactHTMLElement } from "react";

export type AssembledBetterDiscordPlugin = {
    started: boolean;
    authors: any[];
    name: string;
    originalName: string;
    format: "jsdoc";
    internals: any;
    description: string;
    id: string;
    start: () => void;
    stop: () => void;
    instance: {
        start: () => void;
        stop: () => void;
        getSettingsPanel: (() => typeof React.Component | Node | string) | undefined;
        /** @deprecated */
        getName: () => string;
        /** @deprecated */
        getVersion: () => string;
        /** @deprecated */
        getDescription: () => string;
        load: () => void; // is this even officially supported? I don't think bd docs even mention this...
    };
    options: object;
    version: string;
    invite: string;
    patreon: string;
    source: string;
    website: string;
    authorLink: string;
    donate: string;
    sourcePath: string | undefined;
    filename: string;
};

const modalStuff = {
    TextElement_: undefined,
    get TextElement() { return this.TextElement_ ??= getGlobalApi().Webpack.getModule(m => m?.Sizes?.SIZE_32 && m.Colors); },
};

const pluginSettingsModalCreator = (props, name: string, child) => {
    return React.createElement(
        ErrorBoundary,
        {},
        React.createElement(
            ModalRoot,
            Object.assign(
                {
                    size: ModalSize.MEDIUM,
                    className: "bd-addon-modal"
                },
                props
            ),
            React.createElement(
                // mc.Header,
                ModalHeader,
                {
                    separator: false,
                    className: "bd-addon-modal-header",
                },
                React.createElement(
                    modalStuff.TextElement,
                    {
                        tag: "h1",
                        size: modalStuff.TextElement.Sizes.SIZE_20,
                        strong: true,
                    },
                    `${name} Settings`
                )
            ),
            React.createElement(
                // mc.Content,
                ModalContent,
                { className: "bd-addon-modal-settings" },
                React.createElement(ErrorBoundary, {}, child)
            ),
            React.createElement(
                // mc.Footer,
                ModalFooter,
                { className: "bd-addon-modal-footer" },
                React.createElement(
                    Button,
                    {
                        onClick: props.onClose,
                        className: "bd-button",
                    },
                    "Close"
                )
            )
        )
    );
};

function openSettingsModalForPlugin(final: AssembledBetterDiscordPlugin) {
    // let el = final.instance.getSettingsPanel();
    // if (el instanceof Node) {
    //     el = Vencord.Webpack.Common.React.createElement("div", { dangerouslySetInnerHTML: { __html: el.outerHTML } });
    // }
    const panel = final.instance.getSettingsPanel!();
    let child: typeof panel | React.ReactElement = panel;
    if (panel instanceof Node || typeof panel === "string")
        child = class ReactWrapper extends React.Component {
            elementRef: React.RefObject<Node>;
            element: Node | string;
            constructor(props: {}) {
                super(props);
                this.elementRef = React.createRef<Node>();
                this.element = panel as Node | string;
                this.state = { hasError: false };
            }

            componentDidCatch() {
                this.setState({ hasError: true });
            }

            componentDidMount() {
                if (this.element instanceof Node)
                    this.elementRef.current?.appendChild(
                        this.element
                    );
            }

            render() {
                if ((this.state as any).hasError) return null;
                const props = {
                    className: "bd-addon-settings-wrap",
                    ref: this.elementRef,
                };
                if (typeof this.element === "string")
                    (props as any).dangerouslySetInnerHTML = {
                        __html: this.element,
                    };
                return React.createElement("div", props);
            }
        };
    if (typeof child === "function")
        child = React.createElement(child);
    openModal(props => {
        return pluginSettingsModalCreator(props, final.name, child as React.ReactElement);
    });
}

const createOption = (tempOptions: { [x: string]: { type: OptionType; component: () => DetailedReactHTMLElement<{}, HTMLElement>; }; }, key: string | number, label: any, value: any, isUrl = false) => {
    if (value && typeof value === "string") {
        Object.defineProperty(tempOptions, key, {
            value: {
                type: OptionType.COMPONENT,
                component: () => createTextForm(label, value, isUrl),
            },
            enumerable: true,
            writable: true,
        });
    }
};

export async function convertPlugin(BetterDiscordPlugin: string, filename: string, detectDuplicateName: boolean = false, sourcePath = "") {
    const final = {} as AssembledBetterDiscordPlugin;
    final.started = false;
    final.sourcePath = sourcePath;
    final.filename = filename;
    // final.patches = [];
    final.authors = [
        {
            id: 0n,
        },
    ];
    final.name = "";
    final.format = "jsdoc";
    final.internals = {};
    final.description = "";
    final.id = "";
    final.start = () => { };
    final.stop = () => { };
    final.options = {
        openSettings: {
            type: OptionType.COMPONENT,
            description: "Open settings",
            component: () =>
                React.createElement(
                    Button,
                    { onClick: () => openSettingsModalForPlugin(final), disabled: !(typeof final.instance.getSettingsPanel === "function") },
                    "Open settings"
                ),
        },
    };

    let metaEndLine = 0;
    function generateMeta() {
        let lastSuccessfulMetaLine = 0;
        try {
            const metadata = BetterDiscordPlugin
                .split("/**")[1]
                .split("*/")[0]
                .replaceAll("\n", "")
                .split("*")
                .filter(x => x !== "" && x !== " ");
            metaEndLine = metadata.length + 3;
            for (let i = 0; i < metadata.length; i++) {
                const element = metadata[i].trim();
                if (element.startsWith("@name")) {
                    final.name = element.split("@name")[1].trim();
                    final.id = final.name || window.require("path").basename(filename); // what?
                } else if (element.startsWith("@description")) {
                    final.description = element.split("@description ")[1];
                } else if (element.startsWith("@authorId")) {
                    final.authors[0].id = Number(
                        element.split("@authorId ")[1] + "n"
                    );
                } else if (element.startsWith("@author")) {
                    final.authors[0].name = element.split("@author ")[1];
                    // eslint-disable-next-line eqeqeq
                } else if (element != "" && element.length > 2)
                    final[element.split("@")[1].split(" ")[0]] = element.substring(element.split("@")[1].split(" ")[0].length + 2);
                lastSuccessfulMetaLine = i;
            }
        } catch (error) {
            console.error("Something snapped during parsing of meta for file:", filename, `The error got triggered after ${lastSuccessfulMetaLine}-nth line of meta`, "The error was:", error);
            throw error; // let the caller handle this >:)
        }
    }

    function generateCode() {
        // const lines = data.split("\n");
        // const desiredLine = metaEndLine;
        // let codeData = lines.slice(desiredLine - 1).join("\n");
        let codeData = BetterDiscordPlugin;
        // console.log(codeData);
        // const context = {
        // "generatedClass": null,
        // };
        const debugLine =
            "\ntry{" + codeData + "}catch(e){console.error(e);debugger;}";
        const additionalCode = [
            "const module = { exports: {} };",
            "const global = window;",
            // "const Buffer = window.BrowserFS.BFSRequire('buffer').Buffer;",
            "const __filename=BdApi.Plugins.folder+`/" + filename + "`;",
            "const __dirname=BdApi.Plugins.folder;", // should this be set to `sourcePath`?
            "const DiscordNative={get clipboard() { return window.BdCompatLayer.fakeClipboard; }};",
            // "debugger;",
        ];
        // codeData = "(()=>{const module = { exports: {} };const global = window;const __filename=BdApi.Plugins.folder+`/" + filename + "`;const __dirname=BdApi.Plugins.folder;debugger;" + (true ? debugLine : codeData) + "\nreturn module;})();\n";
        // eslint-disable-next-line no-constant-condition
        codeData =
            "(()=>{" +
            additionalCode.join("") +
            // eslint-disable-next-line no-constant-condition
            (true ? debugLine : codeData) +
            "\nreturn module;})();\n";
        // const sourceBlob = new Blob([codeData], {
        //     type: "application/javascript",
        // });
        // const sourceBlobUrl = URL.createObjectURL(sourceBlob);
        // codeData += "\n//# sourceURL=" + sourceBlobUrl;
        codeData += "\n//# sourceURL=" + "betterDiscord://plugins/" + filename;
        if (!window.GeneratedPluginsBlobs)
            window.GeneratedPluginsBlobs = {};
        // window.GeneratedPluginsBlobs[final.name] = sourceBlobUrl;
        // codeData = codeData.replaceAll("module.exports = ", "this.generatedClass = ");
        // window.GeneratedPlugins[final.name] = evalInContext(codeData, context);
        // const codeClass = evalInContext(codeData, context);
        const codeClass = eval.call(window, codeData);
        // const functions = Object.getOwnPropertyNames(codeClass.prototype);

        // for (let i = 0; i < functions.length; i++) {
        //     const element = functions[i];
        //     final[element] = codeClass.prototype[element];
        // }
        final.internals = {
            module: codeClass,
        };
    }

    function generateFunctions() {
        let { exports } = final.internals.module;
        if (typeof exports === "object") {
            exports = exports[final.name];
        }
        final.instance = exports.prototype ? new exports(final) : exports(final);
        // passing the plugin object directly as "meta". what could go wrong??!?!?
        if (typeof final.instance.load === "function") // ESLINT.SHUT. THE. HELL. UP. == IS FINE GOD DANG IT.
            final.instance.load(); // we might crash here but nahhh

        // const functions = Object.getOwnPropertyNames(exports.prototype);

        // for (let i = 0; i < functions.length; i++) {
        //     const element = functions[i];
        //     // if (final.instance[element].bind)
        //     //     final[element] = final.instance[element].bind(final.instance);
        //     // else
        //     final[element] = final.instance[element];
        // }
    }

    generateMeta();
    generateCode();
    generateFunctions();
    if (final.instance.getName) final.name = final.instance.getName();
    if (final.instance.getVersion)
        final.version = final.instance.getVersion() || "6.6.6";
    console.log(final.instance);
    if (final.instance.getDescription)
        final.description = final.instance.getDescription();
    final.originalName = final.name;
    if (detectDuplicateName) {
        // eslint-disable-next-line dot-notation
        if (Vencord.Plugins.plugins[final.name] && !Vencord.Plugins.plugins[final.name]["instance"]) {
            final.name += "-BD";
        }
    }

    /* if (!(final.name && final.version && final.description)) {
        const DavilGiveMorePluginErrorDetails = final ? final.name : final;
        throw new Error(`Had issues compiling BD Plugin: ${DavilGiveMorePluginErrorDetails}`);
    }*/

    const neededMeta = ["name", "version", "description"];
    const whatsMissingDavil = neededMeta.filter(prop => !final || !final[prop]);

    // I literally made this cause there was a plugin not being able to be compiled and its cause you required version AND GAVE NO DATA ON WHAT PLUGIN
    // 😺 You're welcome 😺
    if (whatsMissingDavil.length > 0) {
        const ThisShouldGiveUsWhatIsMissingInThePlugin = whatsMissingDavil.join(", ");
        // throw new Error(`The BD Plugin ${final.name || final.id} is missing: ${ThisShouldGiveUsWhatIsMissingInThePlugin}`); Screw this. I am using our noticesystem
        // LITERALLY WHAT ITS MADE FOR BUDDY OL' PAL
        const TextElement = document.createElement("div");
        TextElement.innerHTML = `The BD Plugin ${final.name || final.id} is missing the following metadata below<br><br>
        <strong>${ThisShouldGiveUsWhatIsMissingInThePlugin.toUpperCase()}</strong><br><br>
        The plugin could not be started, Please fix.`;

        getGlobalApi().showNotice(TextElement, {
            timeout: 0,
            buttons: [
                {
                    label: "Didn't ask ;-)",
                    onClick: () => {
                        console.log("Didn't have to be so mean about it .·´¯`(>▂<)´¯`· \nI'll go away");
                    },
                }
            ]
        });
        throw new Error("Incomplete plugin");
    }

    const tempOptions = {};
    tempOptions["versionLabel"] = {
        type: OptionType.COMPONENT,
        component: () => createTextForm("Version", final.version),
    };
    createOption(tempOptions, "inviteLabel", "Author's Server", `https://discord.gg/${final.invite}`, true);
    createOption(tempOptions, "sourceLabel", "Plugin Source", final.source, true);
    createOption(tempOptions, "websiteLabel", "Plugin's Website", final.website, true);
    createOption(tempOptions, "authorLabel", "Author's Website", final.authorLink, true);
    createOption(tempOptions, "donateLabel", "Author's Donation", final.donate, true);
    createOption(tempOptions, "patreonLabel", "Author's Patreon", final.patreon, true);
    createOption(tempOptions, "authorsLabel", "Author", final.authors[0]?.name);
    final.options = { ...tempOptions, ...final.options };
    for (let prop in tempOptions) {
        if (tempOptions.hasOwnProperty(prop)) {
            tempOptions[prop] = null;
        }
    }
    Object.assign(tempOptions, {});

    // if (final.instance.getAuthor)
    //     final.authors[0].id = final.instance.getAuthor();
    // eslint-disable-next-line eqeqeq
    // if (final.start.toString() == (() => { }).toString() && typeof final.instance.onStart === "function") {
    //     final.start = final.instance.onStart.bind(final.instance);
    //     final.stop = final.instance.onStop.bind(final.instance);
    // }
    const startFunction = function (this: AssembledBetterDiscordPlugin) {
        const compatLayerSettings = Vencord.Settings.plugins[PLUGIN_NAME];
        // compatLayerSettings.pluginsStatus = compatLayerSettings.pluginsStatus ?? {};
        compatLayerSettings.pluginsStatus[this.name] = true;
        this.instance.start();
    };
    const stopFunction = function (this: AssembledBetterDiscordPlugin) {
        const compatLayerSettings = Vencord.Settings.plugins[PLUGIN_NAME];
        // compatLayerSettings.pluginsStatus = compatLayerSettings.pluginsStatus ?? {};
        compatLayerSettings.pluginsStatus[this.name] = false;
        this.instance.stop();
    };
    final.start = startFunction.bind(final);
    final.stop = stopFunction.bind(final);
    console.log(final);
    return final;
}

export async function addCustomPlugin(generatedPlugin: AssembledBetterDiscordPlugin) {
    const { GeneratedPlugins } = window;
    const generated = generatedPlugin;
    PluginMeta[generated.name] = { userPlugin: true, folderName: `${generated.name}/${generated.filename}` };
    Vencord.Plugins.plugins[generated.name] = generated as Plugin;
    Vencord.Settings.plugins[generated.name].enabled = false;

    const compatLayerSettings = Vencord.PlainSettings.plugins[PLUGIN_NAME];
    // compatLayerSettings.pluginsStatus = compatLayerSettings.pluginsStatus ?? {};
    if (generatedPlugin.name in compatLayerSettings.pluginsStatus) {
        const thePluginStatus = compatLayerSettings.pluginsStatus[generatedPlugin.name];
        Vencord.Settings.plugins[generated.name].enabled = thePluginStatus;
        if (thePluginStatus === true)
            Vencord.Plugins.startPlugin(Vencord.Plugins.plugins[generated.name]);
    }
    // Vencord.Settings.plugins[generated.name].enabled = true;
    // Vencord.Plugins.startPlugin(generated as Plugin);
    GeneratedPlugins.push(Vencord.Plugins.plugins[generated.name]);
}

export async function removeAllCustomPlugins() {
    const { GeneratedPlugins } = window as Window & typeof globalThis & { GeneratedPlugins: AssembledBetterDiscordPlugin[]; };
    const copyOfGeneratedPlugin = arrayToObject(GeneratedPlugins);
    const removePlugin = (generatedPlugin: AssembledBetterDiscordPlugin) => {
        const generated = generatedPlugin;
        Vencord.Settings.plugins[generated.name].enabled = false;
        if (generated.started === true) {
            const currentStatus = Vencord.Settings.plugins[PLUGIN_NAME].pluginsStatus[generated.name];
            Vencord.Plugins.stopPlugin(generated as Plugin);
            if (currentStatus === true)
                Vencord.Settings.plugins[PLUGIN_NAME].pluginsStatus[generated.name] = currentStatus;
        }
        delete PluginMeta[generated.name];
        delete Vencord.Plugins.plugins[generated.name];
        // copyOfGeneratedPlugin.splice(copyOfGeneratedPlugin.indexOf(generated), 1);
        delete copyOfGeneratedPlugin[GeneratedPlugins.indexOf(generated)];
    };
    for (let i = 0; i < GeneratedPlugins.length; i++) {
        const element = GeneratedPlugins[i];
        removePlugin(element);
    }
    if (window.BDFDB_Global) // workaround... again
        delete window.BDFDB_Global;
    GeneratedPlugins.length = 0;
}
