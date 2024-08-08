/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./VoiceChannelLogEntryComponent.css";

import { classNameFactory } from "@api/Styles";
import { classes } from "@utils/misc";
import { LazyComponent } from "@utils/react";
import { filters, find, findByPropsLazy, findExportedComponentLazy } from "@webpack";
import { GuildStore, React, Timestamp, UserStore } from "@webpack/common";
import { Channel } from "discord-types/general";
import { Util } from "Vencord";

import { VoiceChannelLogEntry } from "./logs";
import Icon from "./VoiceChannelLogEntryIcons";

// this is terrible, blame mantika and vee for this, as I stole the code from them and adapted it (see ../reviewDB/components/ReviewComponent.tsx line 40 and 46 )

export const VoiceChannelLogEntryComponent = LazyComponent(() => {

    const IconClasses = findByPropsLazy("icon", "acronym", "childWrapper");
    const FriendRow = findExportedComponentLazy("FriendRow");

    // const NameWithRole = findByCode("name", "color", "roleName", "dotAlignment");

    const { avatar, clickable } = find(filters.byProps("avatar", "zalgo", "clickable"));

    const cl = classNameFactory("vc-voice-channel-log-entry-");


    return function VoiceChannelLogEntryComponent({ logEntry, channel }: { logEntry: VoiceChannelLogEntry; channel: Channel; }) {
        const guild = channel.getGuildId() ? GuildStore.getGuild(channel.getGuildId()) : null;
        const user = UserStore.getUser(logEntry.userId);
        return <li className="vc-voice-channel-log-entry">
            <Timestamp className={cl("timestamp")} timestamp={logEntry.timestamp} compact isVisibleOnlyOnHover isInline={false} cozyAlt></Timestamp>
            <Icon logEntry={logEntry} channel={channel} className={cl("icon")} />
            <img
                className={classes(avatar, clickable, cl("avatar"))}
                onClick={() => Util.openUserProfile(logEntry.userId)}
                src={user.getAvatarURL(channel.getGuildId())}
            // style={{ left: "0px", zIndex: 0 }}
            />
            <div className={cl("content")}>
                {/* <NameWithRole ></NameWithRole> */}
            </div>
        </li>;
    };
});
