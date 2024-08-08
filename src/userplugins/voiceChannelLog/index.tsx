/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, Menu, MessageActions, MessageStore, RelationshipStore, SelectedChannelStore, UserStore } from "@webpack/common";
import { Channel, Message, User } from "discord-types/general";

import { addLogEntry } from "./logs";
import { openVoiceChannelLog } from "./VoiceChannelLogModal";

const MessageCreator = findByPropsLazy("createBotMessage");
const SortedVoiceStateStore = findByPropsLazy("getVoiceStatesForChannel");

const settings = definePluginSettings({
    mode: {
        type: OptionType.SELECT,
        description: "How to show the voice channel log",
        options: [
            { label: "Log menu", value: 1, default: true },
            { label: "Log to associated chat directly", value: 2 },
            { label: "Log to chat and log menu", value: 3 },
        ]
    },
    voiceChannelChatSelf: {
        type: OptionType.BOOLEAN,
        description: "Log your own voice channel events in the voice channels",
        default: true
    },
    voiceChannelChatSilent: {
        type: OptionType.BOOLEAN,
        description: "Join/leave/move messages in voice channel chats will be silent",
        default: true
    },
    voiceChannelChatSilentSelf: {
        type: OptionType.BOOLEAN,
        description: "Join/leave/move messages in voice channel chats will be silent if you are in the voice channel",
        default: false
    },
    ignoreBlockedUsers: {
        type: OptionType.BOOLEAN,
        description: "Do not log blocked users",
        default: false
    },
});

interface VoiceState {
    guildId?: string;
    channelId?: string;
    oldChannelId?: string;
    user: User;
    userId: string;
}

function getMessageFlags(selfInChannel: boolean) {
    let flags = 1 << 6;
    if (selfInChannel ? settings.store.voiceChannelChatSilentSelf : settings.store.voiceChannelChatSilent) flags += 1 << 12;
    return flags;
}

function sendVoiceStatusMessage(channelId: string, content: string, userId: string, selfInChannel: boolean): Message | null {
    if (!channelId) return null;
    const message: Message = MessageCreator.createBotMessage({ channelId, content, embeds: [] });
    message.flags = getMessageFlags(selfInChannel);
    message.author = UserStore.getUser(userId);
    // If we try to send a message into an unloaded channel, the client-sided messages get overwritten when the channel gets loaded
    // This might be messy but It Works:tm:
    const messagesLoaded: Promise<any> = MessageStore.hasPresent(channelId) ? new Promise<void>(r => r()) : MessageActions.fetchMessages({ channelId });
    messagesLoaded.then(() => {
        FluxDispatcher.dispatch({
            type: "MESSAGE_CREATE",
            channelId,
            message,
            optimistic: true,
            sendMessageOptions: {},
            isPushNotification: false
        });
    });
    return message;
}

interface ChannelContextProps {
    channel: Channel;
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { channel }: ChannelContextProps) => () => {
    if (!channel) return;

    const group = findGroupChildrenByChildId("hide-voice-names", children);
    const injectIndex = group?.findIndex(i => i?.props?.id === "hide-voice-names");
    if (!injectIndex || !group) return;

    group.splice(injectIndex, 0, (
        <Menu.MenuItem
            id="vc-view-voice-channel-logs"
            label="View Channel Logs"
            action={() => { openVoiceChannelLog(channel); }}
        />
    ));
};

// Blatantly stolen from VcNarrator plugin

// For every user, channelId and oldChannelId will differ when moving channel.
// Only for the local user, channelId and oldChannelId will be the same when moving channel,
// for some ungodly reason
let clientOldChannelId: string | undefined;

export default definePlugin({
    name: "VoiceChannelLog",
    description: "Logs who joins and leaves voice channels",
    authors: [Devs.Sqaaakoi],
    settings,
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!voiceStates) return;
            const clientUserId = UserStore.getCurrentUser().id;
            voiceStates.forEach(state => {
                // mmmm hacky workaround
                const { userId, channelId } = state;
                let { oldChannelId } = state;
                if (userId === clientUserId && channelId !== clientOldChannelId) {
                    oldChannelId = clientOldChannelId;
                    clientOldChannelId = channelId;
                }
                if (settings.store.ignoreBlockedUsers && RelationshipStore.isBlocked(userId)) return;
                // Ignore events from same channel
                if (oldChannelId === channelId) return;

                const logEntry = {
                    userId,
                    oldChannel: oldChannelId || null,
                    newChannel: channelId || null,
                    timestamp: new Date()
                };

                addLogEntry(logEntry, oldChannelId);
                addLogEntry(logEntry, channelId);

                if (!settings.store.voiceChannelChatSelf && userId === clientUserId) return;
                // Join / Leave
                if ((!oldChannelId && channelId) || (oldChannelId && !channelId)) {
                    // empty string is to make type checker shut up
                    const targetChannelId = oldChannelId || channelId || "";
                    const selfInChannel = SelectedChannelStore.getVoiceChannelId() === targetChannelId;
                    sendVoiceStatusMessage(targetChannelId, `${(channelId ? "Joined" : "Left")} <#${targetChannelId}>`, userId, selfInChannel);
                }
                // Move between channels
                if (oldChannelId && channelId) {
                    sendVoiceStatusMessage(oldChannelId, `Moved to <#${channelId}>`, userId, SelectedChannelStore.getVoiceChannelId() === oldChannelId);
                    sendVoiceStatusMessage(channelId, `Moved from <#${oldChannelId}>`, userId, SelectedChannelStore.getVoiceChannelId() === channelId);
                }

            });
        },
    },
    start() {
        addContextMenuPatch("channel-context", UserContextMenuPatch);
    },

    stop() {
        removeContextMenuPatch("channel-context", UserContextMenuPatch);
    },
});
