/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { classes } from "@utils/misc";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { LazyComponent } from "@utils/react";
import { filters, find, findByProps, findStoreLazy } from "@webpack";
import { React, ScrollerThin, Text } from "@webpack/common";
import { Channel } from "discord-types/general";

import { getVcLogs, vcLogSubscribe } from "./logs";
import { VoiceChannelLogEntryComponent } from "./VoiceChannelLogEntryComponent";

const AccessibilityStore = findStoreLazy("AccessibilityStore");
const cl = classNameFactory("vc-voice-channel-log-");

export function openVoiceChannelLog(channel: Channel) {
    return openModal(props => (
        <VoiceChannelLogModal
            props={props}
            channel={channel}
        />
    ));
}

export const VoiceChannelLogModal = LazyComponent(() => {
    const { avatar, clickable } = find(filters.byProps("avatar", "zalgo", "clickable"));
    const { divider, hasContent } = findByProps("divider", "hasContent", "ephemeral");
    const { divider: divider_, hasContent: hasContent_, content } = findByProps("divider", "hasContent", "isUnread", "content");

    return function VoiceChannelLogModal({ channel, props }: { channel: Channel; props: ModalProps; }) {
        React.useSyncExternalStore(vcLogSubscribe, () => getVcLogs(channel.id));
        const vcLogs = getVcLogs(channel.id);
        const logElements: (React.ReactNode)[] = [];

        if (vcLogs.length > 0) {
            for (let i = 0; i < vcLogs.length; i++) {
                const logEntry = vcLogs[i];
                if (i === 0 || logEntry.timestamp.toDateString() !== vcLogs[i - 1].timestamp.toDateString()) {
                    logElements.push(<div className={classes(divider, hasContent, divider_, hasContent_, cl("date-separator"))} role="separator" aria-label={logEntry.timestamp.toDateString()}>
                        <span className={content}>
                            {logEntry.timestamp.toDateString()}
                        </span>
                    </div>);
                } else {
                    logElements.push(<VoiceChannelLogEntryComponent logEntry={logEntry} channel={channel} />);
                }
            }
        } else {
            logElements.push(<div className={cl("empty")}>No logs to display.</div>);
        }

        return (
            <ModalRoot
                {...props}
                size={ModalSize.LARGE}
            >
                <ModalHeader>
                    <Text className={cl("header")} variant="heading-lg/semibold" style={{ flexGrow: 1 }}>{channel.name} logs</Text>
                    <ModalCloseButton onClick={props.onClose} />
                </ModalHeader>

                <ModalContent>
                    <ScrollerThin fade className={classes(cl("scroller"), `group-spacing-${AccessibilityStore.messageGroupSpacing}`)}>
                        {logElements}
                    </ScrollerThin>
                </ModalContent>
            </ModalRoot >
        );
    };
});
