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

/* eslint-disable eqeqeq */
import { Settings } from "@api/Settings";

import { PLUGIN_NAME } from "./constants";
import { fetchWithCorsProxyFallback } from "./fakeStuff";
import { AssembledBetterDiscordPlugin } from "./pluginConstructor";
import { getModule as BdApi_getModule, monkeyPatch as BdApi_monkeyPatch, Patcher } from "./stuffFromBD";
import { docCreateElement } from "./utils";

class PatcherWrapper {
    #label;
    constructor(label) {
        this.#label = label;
    }
    get before() {
        return (...args) => {
            return Patcher.before(this.#label, ...args);
        };
    }
    get instead() {
        return (...args) => {
            return Patcher.instead(this.#label, ...args);
        };
    }
    get after() {
        return (...args) => {
            return Patcher.after(this.#label, ...args);
        };
    }
    get getPatchesByCaller() {
        return () => {
            return Patcher.getPatchesByCaller(this.#label);
        };
    }
    get unpatchAll() {
        return () => {
            return Patcher.unpatchAll(this.#label);
        };
    }
}

export const PluginsHolder = {
    getAll: () => {
        return window.GeneratedPlugins as AssembledBetterDiscordPlugin[];
    },
    isEnabled: name => {
        return Vencord.Plugins.isPluginEnabled(name);
    },
    get: function (name) {
        return this.getAll().filter(x => x.name == name)[0] ?? this.getAll().filter(x => x.originalName == name)[0];
    },
    reload: name => {
        Vencord.Plugins.stopPlugin(Vencord.Plugins.plugins[name]);
        Vencord.Plugins.startPlugin(Vencord.Plugins.plugins[name]);
    },
    // rootFolder: "/BD",
    // folder: (function () { return window.BdApi.Plugins.rootFolder + "/plugins"; })(),
    // folder: "/BD/plugins",
    rootFolder: "/BD",
    get folder() {
        return this.rootFolder + "/plugins";
    },
};

export const WebpackHolder = {
    Filters: {
        byDisplayName: name => {
            return module => {
                return module && module.displayName === name;
            };
        },
        get byKeys() {
            return this.byProps.bind(WebpackHolder.Filters); // just in case
        },
        byProps: (...props) => {
            return Vencord.Webpack.filters.byProps(...props);
        },
        byStoreName(name) {
            return module => {
                return (
                    module?._dispatchToken &&
                    module?.getName?.() === name
                );
            };
        },
        // get byStrings() {
        //     return WebpackHolder.getByStrings;
        // }
        byStrings(...strings) {
            return module => {
                const moduleString = module?.toString([]) || "";
                if (!moduleString) return false; // Could not create string

                return strings.every(s => moduleString.includes(s));
            };
        }
    },
    getModule: BdApi_getModule,
    waitForModule(filter) {
        return new Promise((resolve, reject) => {
            Vencord.Webpack.waitFor(filter, module => {
                resolve(module);
            });
        });
    },
    getModuleWithKey(filter) {
        let target, id, key;

        this.getModule(
            (e, m, i) => filter(e, m, i) && (target = m) && (id = i) && true,
            { searchExports: true }
        );

        for (const k in target.exports) {
            if (filter(target.exports[k], target, id)) {
                key = k;
                break;
            }
        }

        return [target.exports, key];
    },
    getByDisplayName(name) {
        return this.getModule(
            this.Filters.byDisplayName(name)
        );
    },
    getAllByProps(...props) {
        return this.getModule(this.Filters.byProps(...props), {
            first: false,
        });
    },
    getByProps(...props) {
        return this.getModule(this.Filters.byProps(...props), {});
    },
    get getByKeys() {
        return this.getByProps;
    },
    getByPrototypes(...fields) {
        return this.getModule(
            x =>
                x.prototype &&
                fields.every(field => field in x.prototype),
            {}
        );
    },
    get getByPrototypeKeys() {
        return this.getByPrototypes;
    },
    getByStringsOptimal(...strings) {
        return module => {
            if (!module?.toString || typeof (module?.toString) !== "function") return; // Not stringable
            let moduleString = "";
            try { moduleString = module?.toString([]); }
            catch (err) { moduleString = module?.toString(); }
            if (!moduleString) return false; // Could not create string
            for (const s of strings) {
                if (!moduleString.includes(s)) return false;
            }
            return true;
        };
    },
    getByStrings(...strings) {
        return this.getModule(this.Filters.byStrings(strings));
    },
    findByUniqueProperties(props, first = true) {
        return first
            ? this.getByProps(...props)
            : this.getAllByProps(...props);
    },
    getStore(name) {
        return this.getModule(this.Filters.byStoreName(name));
    },
    // require: (() => {
    //     return Vencord.Webpack.wreq;
    // })(),
    get require() {
        return Vencord.Webpack.wreq;
    },
    get modules() {
        // this function is really really wrong
        const { cache } = Vencord.Webpack;
        const result = {};

        for (const key in cache) {
            if (
                // eslint-disable-next-line no-prototype-builtins
                cache.hasOwnProperty(key) &&
                // eslint-disable-next-line no-prototype-builtins
                cache[key].hasOwnProperty("exports")
            ) {
                result[key] = cache[key].exports;
            }
        }
        return result;
    },
};

export const DataHolder = {
    pluginData: {},
    latestDataCheck(key) {
        if (typeof this.pluginData[key] !== "undefined") return;
        if (
            !window
                .require("fs")
                .existsSync(
                    PluginsHolder.folder +
                    "/" +
                    key +
                    ".config.json"
                )
        ) {
            this.pluginData[key] = {};
            return;
        }
        this.pluginData[key] = JSON.parse(
            window
                .require("fs")
                .readFileSync(
                    PluginsHolder.folder +
                    "/" +
                    key +
                    ".config.json"
                )
        );
    },
    load(key, value) {
        // if (!this.pluginData[key]) {
        //     if (!window.require("fs").existsSync(BdApiReimpl.Plugins.folder + "/" + key + ".config.json"))
        //         this.pluginData[key] = {};
        //     this.pluginData[key] = JSON.parse(window.require("fs").readFileSync(BdApiReimpl.Plugins.folder + "/" + key + ".config.json"));
        // }
        if (!value || !key) return;
        this.latestDataCheck(key);
        return this.pluginData[key][value];
    },
    save(key, value, data) {
        if (!value || !key || !data) return;
        this.latestDataCheck(key);
        this.pluginData[key][value] = data;
        window
            .require("fs")
            .writeFileSync(
                PluginsHolder.folder + "/" + key + ".config.json",
                JSON.stringify(this.pluginData[key], null, 4)
            );
    }
};

class DataWrapper {
    #label;
    constructor(label) {
        this.#label = label;
    }
    get load() {
        return value => {
            return DataHolder.load(this.#label, value);
        };
    }
    get save() {
        return (key, data) => {
            return DataHolder.save(this.#label, key, data);
        };
    }
}

export const UIHolder = {
    helper() {
        console.info("hi");
    },
    showToast(message, toastType = 1) {
        const { createToast, showToast } = getGlobalApi().Webpack.getModule(x => x.createToast && x.showToast);
        showToast(createToast(message || "Success !", [0, 1, 2, 3, 4, 5].includes(toastType) ? toastType : 1)); // showToast has more then 3 toast types?
        // uhmm.. aschtually waht is 4.
    },
    showConfirmationModal(title: string, content: any, settings: any = {}) {
        // The stolen code from my beloved davyy has been removed. :(
        const Colors = {
            BRAND: getGlobalApi().findModuleByProps("colorBrand").colorBrand
        };
        const ConfirmationModal = getGlobalApi().Webpack.getModule(x => x.ConfirmModal).ConfirmModal;
        const { openModal } = getGlobalApi().Webpack.getModule(x => x.closeModal && x.openModal && x.hasModalOpen);

        const {
            confirmText = settings.confirmText || "Confirm",
            cancelText = settings.cancelText || "Cancel",
            onConfirm = settings.onConfirm || (() => { }),
            onCancel = settings.onCancel || (() => { }),
            extraReact = settings.extraReact || [],
        } = settings;

        const moreReact: React.ReactElement[] = [];

        const whiteTextStyle = {
            color: "white",
        };

        const React = getGlobalApi().React;
        const whiteTextContent = React.createElement("div", { style: whiteTextStyle }, content);

        moreReact.push(whiteTextContent);
        // moreReact.push(...extraReact) // IM ADDING MORE DIV POSSIBILITESS !!!!

        // I dont know how anyone would find this useful but screw it yeah?
        // Someone will find it useful one day
        /*
        USAGE:::
        const extra1 = BdApi.React.createElement("div", {}, "Extra 1");
        const extra2 = BdApi.React.createElement("div", {}, "Extra 2");

        const extraReact = [extra1, extra2];

        BdApi.UI.showConfirmationModal(
        "Modal title",
        "Modal content",
        {
            extraReact: extraReact
        }
        );
        */
        extraReact.forEach(reactElement => {
            moreReact.push(reactElement);
        });

        openModal(props => React.createElement(ConfirmationModal, Object.assign({
            header: title,
            confirmButtonColor: Colors.BRAND,
            confirmText: confirmText,
            cancelText: cancelText,
            onConfirm: onConfirm,
            onCancel: onCancel,
            children: moreReact,
            ...props
        })));
    },
    showNotice_(title, content, options: any = {}) {
        // const { React, ReactDOM } = BdApiReImplementation;
        const container = document.createElement("div");
        container.className = "custom-notification-container";

        const closeNotification = () => {
            const customNotification = container.querySelector(".custom-notification");
            if (customNotification) {
                customNotification.classList.add("close");
                setTimeout(() => {
                    // ReactDOM.unmountComponentAtNode(container);
                    document.body.removeChild(container);
                }, 1000);
            }
        };

        const { timeout = 0, type = "default" } = options;
        const buttons = [
            { label: "Close", onClick: () => { } },
            ...options.buttons || []
        ];

        const buttonElements = buttons.map((button, index) => {
            const onClickHandler = () => {
                button.onClick();
                closeNotification();
            };

            // return React.createElement(
            //     "button",
            //     { key: index, className: "confirm-button", onClick: onClickHandler },
            //     button.label
            // );
            // const t = document.createElement("button");
            // t.setAttribute("key", index);
            // t.className = "confirm-button";
            // t.onclick = onClickHandler;
            // // t.onClick = t.onclick;
            // t.append(button.label);
            // return t;
            return docCreateElement("button", { className: "confirm-button", onclick: onClickHandler }, [typeof button.label === "string" ? docCreateElement("span", { innerText: button.label }) : button.label]);
        });
        // const xButton = React.createElement(
        //     "button",
        //     { onClick: closeNotification, className: "button-with-svg" },
        //     React.createElement(
        //         "svg",
        //         { width: "24", height: "24", className: "xxx" },
        //         React.createElement("path", {
        //             d:
        //                 "M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z",
        //             stroke: "white",
        //             strokeWidth: "2",
        //             fill: "none",
        //         })
        //     )
        // );
        const xButton = docCreateElement("button", { onclick: closeNotification, className: "button-with-svg" }, [
            docCreateElement("svg", { className: "xxx" }, [
                docCreateElement("path", undefined, undefined, {
                    stroke: "white",
                    strokeWidth: "2",
                    fill: "none",
                    d:
                        "M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z",
                }),
            ], { style: "width: 24px; height: 24px;" }),
        ]);
        // const titleComponent = typeof title === "string" ? (
        //     React.createElement("div", { className: "notification-title" }, title, xButton)
        // ) : (
        //     React.createElement(
        //         title.tagName.toLowerCase(),
        //         { className: "notification-title" },
        //         title.textContent || " ",
        //         xButton
        //     )
        // );
        // const titleComponent = docCreateElement("span", { className: "notification-title" }, [typeof title === "string" ? docCreateElement("span", { innerText: title }) : title, xButton]);
        const titleComponent = docCreateElement("span", { className: "notification-title" }, [typeof title === "string" ? docCreateElement("span", { innerText: title }) : title]);
        // const contentComponent = typeof content === "string" ? (
        //     React.createElement("div", { className: "content" }, content)
        // ) : (
        //     React.isValidElement(content) ? content : React.createElement("div", { className: "content" }, " ") // Very nice looking fallback. I dont know why I dont optimize code along the way.
        // );
        const contentComponent = docCreateElement("div", { className: "content" }, [typeof content === "string" ? docCreateElement("span", { innerText: title }) : content]);

        // const customNotification = React.createElement(
        //     "div",
        //     { className: `custom-notification ${type}` },
        //     React.createElement("div", { className: "top-box" }, titleComponent),
        //     contentComponent,
        //     React.createElement("div", { className: "bottom-box" }, buttonElements)
        // );
        const customNotification = docCreateElement("div", { className: `custom-notification ${type}` }, [
            docCreateElement("div", { className: "top-box" }, [titleComponent]),
            contentComponent,
            docCreateElement("div", { className: "bottom-box" }, buttonElements),
        ]);

        // ReactDOM.render(customNotification, container);
        container.appendChild(customNotification);
        document.body.appendChild(container);

        if (timeout > 0) {
            setTimeout(closeNotification, timeout);
        }
    },
    showNotice(content, options) {
        return this.showNotice_("Notice", content, options);
    },
};

export const DOMHolder = {
    addStyle(id, css) {
        id = id.replace(/^[^a-z]+|[^\w-]+/gi, "-");
        const style: HTMLElement =
            document
                .querySelector("bd-styles")
                ?.querySelector(`#${id}`) ||
            this.createElement("style", { id });
        style.textContent = css;
        document.querySelector("bd-styles")?.append(style);
    },
    removeStyle(id) {
        id = id.replace(/^[^a-z]+|[^\w-]+/gi, "-");
        const exists = document
            .querySelector("bd-styles")
            ?.querySelector(`#${id}`);
        if (exists) exists.remove();
    },
    createElement(tag, options: any = {}, child = null) {
        const { className, id, target } = options;
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (id) element.id = id;
        if (child) element.append(child);
        if (target) document.querySelector(target).append(element);
        return element;
    },
};

class DOMWrapper {
    #label;
    constructor(label) {
        this.#label = label;
    }
    get addStyle() {
        return (id, css) => {
            if (arguments.length === 2) {
                id = arguments[0];
                css = arguments[1];
            }
            else {
                css = id;
                id = this.#label;
            }
            return DOMHolder.addStyle(id, css);
        };
    }
    get removeStyle() {
        return id => {
            if (arguments.length === 1) {
                id = arguments[0];
            }
            else {
                id = this.#label;
            }
            return DOMHolder.removeStyle(id);
        };
    }
    get createElement() {
        return DOMHolder.createElement;
    }
}

class BdApiReImplementationInstance {
    #targetPlugin;
    #patcher: PatcherWrapper | typeof Patcher;
    #data: DataWrapper | typeof DataHolder;
    #dom: DOMWrapper | typeof DOMHolder;
    ContextMenu = {};
    labelsOfInstancedAPI: { [key: string]: BdApiReImplementationInstance; };
    constructor(label?: string) {
        if (label) {
            if (getGlobalApi().labelsOfInstancedAPI[label]) {
                // @ts-ignore
                this.labelsOfInstancedAPI = undefined;
                // @ts-ignore
                this.#patcher = undefined;
                // @ts-ignore
                this.#data = undefined;
                // @ts-ignore
                this.#dom = undefined;
                // ts shut up please
                return getGlobalApi().labelsOfInstancedAPI[label];
            }
            this.#targetPlugin = label;
            this.#patcher = new PatcherWrapper(label);
            this.#data = new DataWrapper(label);
            this.#dom = new DOMWrapper(label);
            // @ts-ignore
            this.labelsOfInstancedAPI = undefined;
            getGlobalApi().labelsOfInstancedAPI[label] = this;
            Object.defineProperty(this, "ContextMenu", {
                get() {
                    return getGlobalApi().ContextMenu;
                }
            });
        }
        else {
            // window.globalApisCreated = (window.globalApisCreated !== undefined ? window.globalApisCreated + 1 : 0);
            this.#patcher = Patcher;
            this.#data = DataHolder;
            this.#dom = DOMHolder;
            this.labelsOfInstancedAPI = {};
            return getGlobalApi();
        }
    }
    get Patcher() {
        return this.#patcher;
    }
    get Plugins() { return PluginsHolder; }
    Components = {
        get Tooltip() {
            return getGlobalApi().Webpack.getModule(
                x => x && x.prototype && x.prototype.renderTooltip,
                { searchExports: true }
            );
        },
    };
    get React() {
        return Vencord.Webpack.Common.React;
    }
    get Webpack() {
        return WebpackHolder;
    }
    isSettingEnabled(collection, category, id) {
        return false;
    }
    enableSetting(collection, category, id) { }
    disableSetting(collection, category, id) { }
    get ReactDOM() {
        return WebpackHolder.getModule(x => x.render && x.findDOMNode);
    }
    get ReactUtils() {
        return {
            getInternalInstance(node: Node & any) {
                return node.__reactFiber$ || node[Object.keys(node).find(k => k.startsWith("__reactInternalInstance") || k.startsWith("__reactFiber")) as string] || null;
            }
        };
    }
    findModuleByProps(...props) {
        return this.findModule(module =>
            props.every(prop => typeof module[prop] !== "undefined")
        );
    }
    findModule(filter) {
        return this.Webpack.getModule(filter);
    }
    findAllModules(filter) {
        return this.Webpack.getModule(filter, { first: false });
    }
    suppressErrors(method, message = "") {
        return (...params) => {
            try {
                return method(...params);
            } catch (err) {
                console.error(err, `Error occured in ${message}`);
            }
        };
    }
    get monkeyPatch() { return BdApi_monkeyPatch; }
    get Data() {
        return this.#data;
    }
    get loadData() {
        return this.Data.load.bind(this.Data);
    }
    get saveData() {
        return this.Data.save.bind(this.Data);
    }
    get setData() {
        return this.Data.save.bind(this.Data);
    }
    get getData() {
        return this.Data.load.bind(this.Data);
    }
    readonly Utils = {
        findInTree(tree, searchFilter, options = {}) {
            const { walkable = null, ignore = [] } = options as { walkable: string[], ignore: string[]; };

            function findInObject(obj) {
                for (const key in obj) {
                    if (ignore.includes(key)) continue;
                    const value = obj[key];

                    if (searchFilter(value)) return value;

                    if (typeof value === "object" && value !== null) {
                        const result = findInObject(value);
                        if (result !== undefined) return result;
                    }
                }
                return undefined;
            }

            if (typeof searchFilter === "string") return tree?.[searchFilter];
            if (searchFilter(tree)) return tree;

            if (Array.isArray(tree)) {
                for (const value of tree) {
                    const result = this.findInTree(value, searchFilter, { walkable, ignore });
                    if (result !== undefined) return result;
                }
            } else if (typeof tree === "object" && tree !== null) {
                const keysToWalk = walkable || Object.keys(tree);
                for (const key of keysToWalk) {
                    if (tree[key] === undefined) continue;
                    const result = this.findInTree(tree[key], searchFilter, { walkable, ignore });
                    if (result !== undefined) return result;
                }
            }

            return undefined;
        }
    };
    get UI() {
        return UIHolder;
    }
    get Net() {
        return {
            fetch: (url: string, options) => { return fetchWithCorsProxyFallback(url, options, Settings.plugins[PLUGIN_NAME].corsProxyUrl); },
        };
    }
    alert(title, content) {
        UIHolder.showConfirmationModal(title, content, { cancelText: null });
    }
    showToast(content, toastType = 1) {
        UIHolder.showToast(content, toastType);
    }
    showNotice(content, settings = {}) {
        UIHolder.showNotice(content, settings);
    }
    showConfirmationModal(title, content, settings = {}) {
        UIHolder.showConfirmationModal(title, content, settings);
    }
    get injectCSS() {
        return DOMHolder.addStyle;
    }
    get DOM() {
        return this.#dom;
    }
}

function assignToGlobal() {
    const letsHopeThisObjectWillBeTheOnlyGlobalBdApiInstance = new BdApiReImplementationInstance();
    const gettersToSet = ["Components", "ContextMenu", "DOM", "Data", "Patcher", "Plugins", "React", "ReactDOM", "ReactUtils", "UI", "Net", "Utils", "Webpack", "labelsOfInstancedAPI", "alert", "disableSetting", "enableSetting", "findModule", "findModuleByProps", "findAllModules", "getData", "isSettingEnabled", "loadData", "monkeyPatch", "saveData", "setData", "showConfirmationModal", "showNotice", "showToast", "suppressErrors", "injectCSS"];
    const settersToSet = ["ContextMenu"];
    for (let index = 0; index < gettersToSet.length; index++) {
        const element = gettersToSet[index];
        let setter = undefined as ((v: any) => any) | undefined;
        if (settersToSet.indexOf(element) !== -1) {
            setter = (v => letsHopeThisObjectWillBeTheOnlyGlobalBdApiInstance[element] = v);
        }
        Object.defineProperty(BdApiReImplementationInstance, element, {
            get: () => letsHopeThisObjectWillBeTheOnlyGlobalBdApiInstance[element],
            set: setter,
            configurable: true,
        });
    }
}
export function cleanupGlobal() {
    const gettersToSet = ["Components", "ContextMenu", "DOM", "Data", "Patcher", "Plugins", "React", "ReactDOM", "ReactUtils", "UI", "Net", "Utils", "Webpack", "labelsOfInstancedAPI", "alert", "disableSetting", "enableSetting", "findModule", "findModuleByProps", "findAllModules", "getData", "isSettingEnabled", "loadData", "monkeyPatch", "saveData", "setData", "showConfirmationModal", "showNotice", "showToast", "suppressErrors", "injectCSS"];
    for (let index = 0; index < gettersToSet.length; index++) {
        const element = gettersToSet[index];
        delete getGlobalApi()[element];
    }
}
type BdApiReImplementationGlobal = typeof BdApiReImplementationInstance & BdApiReImplementationInstance;

// class BdApi_ {
//     instance: BdApiReImplementationInstance;
//     constructor(label) {
//         // return new BdApiReImplementationInstance(label);
//         this.instance = new BdApiReImplementationInstance(label);
//         return this.instance;
//     }
//     static get Patcher() {
//         return this.instance;
//     }
// }
// it's late night

export function createGlobalBdApi() {
    assignToGlobal();
    return BdApiReImplementationInstance as BdApiReImplementationGlobal;
    // return new BdApiReImplementationInstance();
    // const mod = BdApiReImplementationInstance;
    // // mod.internalInstance = new BdApiReImplementationInstance();
    // Object.defineProperty(mod, "internalInstance", {
    //     value: new BdApiReImplementationInstance()
    // });
    // const modProxy = new Proxy(mod, {
    //     get(target, prop) {
    //         // @ts-ignore
    //         if (target.internalInstance[prop]) {
    //             // @ts-ignore
    //             return target.internalInstance[prop];
    //         }
    //         // console.log("prop", prop);
    //         if (prop == "prototype")
    //             return BdApiReImplementationInstance;
    //         return undefined;
    //     },
    //     set(target, p, newValue) {
    //         // @ts-ignore
    //         target.internalInstance[p] = newValue;
    //         return true;
    //     },
    // });
    // return modProxy;
}

export function getGlobalApi() {
    return window.BdApi as BdApiReImplementationGlobal;
}
