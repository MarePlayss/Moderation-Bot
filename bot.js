
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, ChannelType } = require('discord.js');
const ms = require('ms');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;

// Load additional owners from file
let additionalOwners = [];
try {
    additionalOwners = JSON.parse(fs.readFileSync('owners.json', 'utf8'));
} catch (error) {
    fs.writeFileSync('owners.json', JSON.stringify([], null, 2));
}

// Load configuration files
let warns = {};
let mutes = {};
let automodConfig = {
    enabled: false,
    antiSpam: false,
    antiLinks: false,
    antiCaps: false,
    badWords: []
};
let ignoredChannels = [];
let whitelistRoles = [];
let whitelistUsers = [];

// Initialize files
try {
    warns = JSON.parse(fs.readFileSync('warns.json', 'utf8'));
} catch (error) {
    fs.writeFileSync('warns.json', JSON.stringify({}, null, 2));
}

try {
    mutes = JSON.parse(fs.readFileSync('mutes.json', 'utf8'));
} catch (error) {
    fs.writeFileSync('mutes.json', JSON.stringify({}, null, 2));
}

try {
    automodConfig = JSON.parse(fs.readFileSync('automod.json', 'utf8'));
} catch (error) {
    fs.writeFileSync('automod.json', JSON.stringify(automodConfig, null, 2));
}

try {
    ignoredChannels = JSON.parse(fs.readFileSync('ignored.json', 'utf8'));
} catch (error) {
    fs.writeFileSync('ignored.json', JSON.stringify([], null, 2));
}

try {
    whitelistRoles = JSON.parse(fs.readFileSync('whitelist_roles.json', 'utf8'));
} catch (error) {
    fs.writeFileSync('whitelist_roles.json', JSON.stringify([], null, 2));
}

try {
    whitelistUsers = JSON.parse(fs.readFileSync('whitelist_users.json', 'utf8'));
} catch (error) {
    fs.writeFileSync('whitelist_users.json', JSON.stringify([], null, 2));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

let afkUsers = {};

function hasPermission(message, permission) {
    if (message.author.id === OWNER_ID || additionalOwners.includes(message.author.id)) return true;
    return message.member.permissions.has(permission);
}

function isOwner(userId) {
    return userId === OWNER_ID || additionalOwners.includes(userId);
}

function missingPerm(message, permName) {
    return message.reply(`❌ You need the "${permName}" permission to use this command.`);
}

function saveFile(filename, data) {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Automod checks
    if (automodConfig.enabled && !ignoredChannels.includes(message.channel.id) && 
        !whitelistUsers.includes(message.author.id) && 
        !message.member.roles.cache.some(role => whitelistRoles.includes(role.id))) {
        
        let shouldDelete = false;
        
        // Anti-spam check
        if (automodConfig.antiSpam) {
            // Simple spam detection - more than 5 messages in 5 seconds
            // Implementation would require message tracking
        }
        
        // Anti-links check
        if (automodConfig.antiLinks && (message.content.includes('http://') || message.content.includes('https://'))) {
            shouldDelete = true;
        }
        
        // Anti-caps check
        if (automodConfig.antiCaps && message.content.length > 10) {
            const capsPercentage = (message.content.match(/[A-Z]/g) || []).length / message.content.length;
            if (capsPercentage > 0.7) shouldDelete = true;
        }
        
        // Bad words check
        if (automodConfig.badWords.some(word => message.content.toLowerCase().includes(word.toLowerCase()))) {
            shouldDelete = true;
        }
        
        if (shouldDelete) {
            try {
                await message.delete();
                message.channel.send(`🚫 ${message.author}, your message was deleted by automod.`).then(msg => {
                    setTimeout(() => msg.delete(), 5000);
                });
            } catch (error) {
                console.log('Failed to delete message:', error);
            }
        }
    }

    // Check if user is returning from AFK
    if (afkUsers[message.author.id] && !message.content.startsWith('$afk')) {
        const afkData = afkUsers[message.author.id];
        const timeDiff = Math.floor((Date.now() - afkData.time) / 1000 / 60);
        delete afkUsers[message.author.id];
        message.reply(`👋 Welcome back! You were AFK for ${timeDiff} minute(s): ${afkData.reason}`);
    }

    // Check if someone mentioned an AFK user
    message.mentions.users.forEach(user => {
        if (afkUsers[user.id]) {
            const afkData = afkUsers[user.id];
            const timeDiff = Math.floor((Date.now() - afkData.time) / 1000 / 60);
            message.reply(`💤 ${user.username} is currently AFK (${timeDiff} minute(s) ago): ${afkData.reason}`);
        }
    });

    if (!message.content.startsWith('$')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Basic moderation commands
    if (command === 'ban') {
        if (!hasPermission(message, PermissionsBitField.Flags.BanMembers))
            return missingPerm(message, "Ban Members");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to ban.");
        try {
            await member.ban({ reason: args.slice(1).join(' ') || 'No reason provided' });
            message.reply(`✅ Successfully banned ${member.user.tag}`);
        } catch (error) {
            message.reply(`❌ Failed to ban ${member.user.tag}. Error: ${error.message}`);
        }
    }

    if (command === 'unban') {
        if (!hasPermission(message, PermissionsBitField.Flags.BanMembers))
            return missingPerm(message, "Ban Members");
        const userId = args[0];
        if (!userId) return message.reply("❌ Please provide a user ID to unban.");
        try {
            await message.guild.members.unban(userId);
            message.reply(`✅ Successfully unbanned user with ID: ${userId}`);
        } catch (error) {
            message.reply(`❌ Failed to unban user. Error: ${error.message}`);
        }
    }

    if (command === 'kick') {
        if (!hasPermission(message, PermissionsBitField.Flags.KickMembers))
            return missingPerm(message, "Kick Members");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to kick.");
        try {
            await member.kick(args.slice(1).join(' ') || 'No reason provided');
            message.reply(`✅ Successfully kicked ${member.user.tag}`);
        } catch (error) {
            message.reply(`❌ Failed to kick ${member.user.tag}. Error: ${error.message}`);
        }
    }

    if (command === 'mute') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageRoles))
            return missingPerm(message, "Manage Roles");
        const member = message.mentions.members.first();
        const time = args[1];
        if (!member || !time) return message.reply("❌ Usage: $mute @user 10m");
        try {
            const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted') || 
                await message.guild.roles.create({ name: 'Muted', permissions: [] });
            await member.roles.add(muteRole);
            mutes[member.id] = Date.now() + ms(time);
            saveFile('mutes.json', mutes);
            message.reply(`✅ Successfully muted ${member.user.tag} for ${time}`);
        } catch (error) {
            message.reply(`❌ Failed to mute ${member.user.tag}. Error: ${error.message}`);
        }
    }

    if (command === 'unmute') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageRoles))
            return missingPerm(message, "Manage Roles");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to unmute.");
        try {
            const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
            if (muteRole) await member.roles.remove(muteRole);
            delete mutes[member.id];
            saveFile('mutes.json', mutes);
            message.reply(`✅ Successfully unmuted ${member.user.tag}`);
        } catch (error) {
            message.reply(`❌ Failed to unmute ${member.user.tag}. Error: ${error.message}`);
        }
    }

    if (command === 'nick') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageNicknames))
            return missingPerm(message, "Manage Nicknames");
        const member = message.mentions.members.first();
        const nickname = args.slice(1).join(' ');
        if (!member) return message.reply("❌ Please mention a user.");
        try {
            await member.setNickname(nickname || null);
            message.reply(`✅ Successfully changed ${member.user.tag}'s nickname`);
        } catch (error) {
            message.reply(`❌ Failed to change nickname. Error: ${error.message}`);
        }
    }

    if (command === 'lock') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageChannels))
            return missingPerm(message, "Manage Channels");
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: false
            });
            message.reply("✅ Successfully locked this channel");
        } catch (error) {
            message.reply(`❌ Failed to lock channel. Error: ${error.message}`);
        }
    }

    if (command === 'unlock') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageChannels))
            return missingPerm(message, "Manage Channels");
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: null
            });
            message.reply("✅ Successfully unlocked this channel");
        } catch (error) {
            message.reply(`❌ Failed to unlock channel. Error: ${error.message}`);
        }
    }

    // Automod commands
    if (command === 'automod') {
        if (!hasPermission(message, PermissionsBitField.Flags.Administrator))
            return missingPerm(message, "Administrator");
        
        const subcommand = args[0];
        if (subcommand === 'config') {
            const setting = args[1];
            const value = args[2];
            
            if (setting === 'enable') {
                automodConfig.enabled = true;
                saveFile('automod.json', automodConfig);
                message.reply("✅ Automod enabled");
            } else if (setting === 'disable') {
                automodConfig.enabled = false;
                saveFile('automod.json', automodConfig);
                message.reply("✅ Automod disabled");
            } else if (setting === 'antispam') {
                automodConfig.antiSpam = value === 'true';
                saveFile('automod.json', automodConfig);
                message.reply(`✅ Anti-spam ${automodConfig.antiSpam ? 'enabled' : 'disabled'}`);
            } else if (setting === 'antilinks') {
                automodConfig.antiLinks = value === 'true';
                saveFile('automod.json', automodConfig);
                message.reply(`✅ Anti-links ${automodConfig.antiLinks ? 'enabled' : 'disabled'}`);
            } else if (setting === 'anticaps') {
                automodConfig.antiCaps = value === 'true';
                saveFile('automod.json', automodConfig);
                message.reply(`✅ Anti-caps ${automodConfig.antiCaps ? 'enabled' : 'disabled'}`);
            } else {
                message.reply("❌ Usage: $automod config <enable/disable/antispam/antilinks/anticaps> [true/false]");
            }
        } else {
            message.reply("❌ Usage: $automod config <setting>");
        }
    }

    // Ignore commands
    if (command === 'ignore') {
        if (!hasPermission(message, PermissionsBitField.Flags.Administrator))
            return missingPerm(message, "Administrator");
        
        const subcommand = args[0];
        if (subcommand === 'channel') {
            const channel = message.mentions.channels.first() || message.channel;
            if (!ignoredChannels.includes(channel.id)) {
                ignoredChannels.push(channel.id);
                saveFile('ignored.json', ignoredChannels);
                message.reply(`✅ Added ${channel.name} to ignored channels`);
            } else {
                message.reply("❌ Channel is already ignored");
            }
        } else if (subcommand === 'user') {
            const user = message.mentions.users.first();
            if (!user) return message.reply("❌ Please mention a user");
            if (!whitelistUsers.includes(user.id)) {
                whitelistUsers.push(user.id);
                saveFile('whitelist_users.json', whitelistUsers);
                message.reply(`✅ Added ${user.tag} to whitelist`);
            } else {
                message.reply("❌ User is already whitelisted");
            }
        }
    }

    // Whitelist commands
    if (command === 'whitelist') {
        if (!hasPermission(message, PermissionsBitField.Flags.Administrator))
            return missingPerm(message, "Administrator");
        
        const subcommand = args[0];
        if (subcommand === 'role') {
            const action = args[1];
            const role = message.mentions.roles.first();
            if (!role) return message.reply("❌ Please mention a role");
            
            if (action === 'add') {
                if (!whitelistRoles.includes(role.id)) {
                    whitelistRoles.push(role.id);
                    saveFile('whitelist_roles.json', whitelistRoles);
                    message.reply(`✅ Added ${role.name} to whitelist roles`);
                } else {
                    message.reply("❌ Role is already whitelisted");
                }
            } else if (action === 'remove') {
                const index = whitelistRoles.indexOf(role.id);
                if (index > -1) {
                    whitelistRoles.splice(index, 1);
                    saveFile('whitelist_roles.json', whitelistRoles);
                    message.reply(`✅ Removed ${role.name} from whitelist roles`);
                } else {
                    message.reply("❌ Role is not whitelisted");
                }
            }
        } else if (subcommand === 'user') {
            const action = args[1];
            const user = message.mentions.users.first();
            if (!user) return message.reply("❌ Please mention a user");
            
            if (action === 'add') {
                if (!whitelistUsers.includes(user.id)) {
                    whitelistUsers.push(user.id);
                    saveFile('whitelist_users.json', whitelistUsers);
                    message.reply(`✅ Added ${user.tag} to whitelist users`);
                } else {
                    message.reply("❌ User is already whitelisted");
                }
            } else if (action === 'remove') {
                const index = whitelistUsers.indexOf(user.id);
                if (index > -1) {
                    whitelistUsers.splice(index, 1);
                    saveFile('whitelist_users.json', whitelistUsers);
                    message.reply(`✅ Removed ${user.tag} from whitelist users`);
                } else {
                    message.reply("❌ User is not whitelisted");
                }
            }
        }
    }

    // Advanced purge commands
    if (command === 'purge') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        
        const subcommand = args[0];
        const amount = parseInt(args[1]) || 50;
        
        if (amount < 1 || amount > 100) {
            return message.reply("❌ Please specify a number between 1 and 100");
        }
        
        try {
            const messages = await message.channel.messages.fetch({ limit: amount });
            let toDelete = [];
            
            if (subcommand === 'bots') {
                toDelete = messages.filter(msg => msg.author.bot);
            } else if (subcommand === 'humans') {
                toDelete = messages.filter(msg => !msg.author.bot);
            } else if (subcommand === 'mentions') {
                toDelete = messages.filter(msg => msg.mentions.users.size > 0);
            } else if (subcommand === 'emojis') {
                toDelete = messages.filter(msg => /:\w+:|<:\w+:\d+>/.test(msg.content));
            } else if (subcommand === 'stickers') {
                toDelete = messages.filter(msg => msg.stickers.size > 0);
            } else if (subcommand === 'contains') {
                const searchTerm = args.slice(2).join(' ');
                if (!searchTerm) return message.reply("❌ Please specify text to search for");
                toDelete = messages.filter(msg => msg.content.toLowerCase().includes(searchTerm.toLowerCase()));
            } else if (subcommand === 'attachments') {
                toDelete = messages.filter(msg => msg.attachments.size > 0);
            } else if (subcommand === 'links') {
                toDelete = messages.filter(msg => /https?:\/\//.test(msg.content));
            } else {
                // Regular purge
                const count = parseInt(subcommand) || 50;
                await message.channel.bulkDelete(count, true);
                return message.reply(`✅ Successfully deleted ${count} messages.`);
            }
            
            if (toDelete.size > 0) {
                await message.channel.bulkDelete(toDelete, true);
                message.reply(`✅ Successfully deleted ${toDelete.size} ${subcommand} messages.`);
            } else {
                message.reply(`❌ No ${subcommand} messages found to delete.`);
            }
        } catch (error) {
            message.reply(`❌ Failed to delete messages. Error: ${error.message}`);
        }
    }

    // List commands
    if (command === 'list') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageGuild))
            return missingPerm(message, "Manage Server");
        
        const subcommand = args[0];
        try {
            if (subcommand === 'bans') {
                const bans = await message.guild.bans.fetch();
                if (bans.size === 0) {
                    message.reply("✅ No banned users found.");
                } else {
                    const banList = bans.map(ban => `${ban.user.tag} (${ban.user.id})`).slice(0, 10).join('\n');
                    message.reply(`✅ Banned users (showing first 10):\n\`\`\`${banList}\`\`\``);
                }
            } else if (subcommand === 'roles') {
                const roles = message.guild.roles.cache.filter(role => role.name !== '@everyone');
                const roleList = roles.map(role => `${role.name} (${role.members.size} members)`).slice(0, 10).join('\n');
                message.reply(`✅ Server roles (showing first 10):\n\`\`\`${roleList}\`\`\``);
            } else if (subcommand === 'channels') {
                const channels = message.guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText);
                const channelList = channels.map(channel => `#${channel.name}`).slice(0, 10).join('\n');
                message.reply(`✅ Text channels (showing first 10):\n\`\`\`${channelList}\`\`\``);
            } else if (subcommand === 'muted') {
                const mutedUsers = Object.keys(mutes).filter(userId => mutes[userId] > Date.now());
                if (mutedUsers.length === 0) {
                    message.reply("✅ No currently muted users.");
                } else {
                    const mutedList = mutedUsers.slice(0, 10).join('\n');
                    message.reply(`✅ Currently muted users (showing first 10):\n\`\`\`${mutedList}\`\`\``);
                }
            }
        } catch (error) {
            message.reply(`❌ Failed to fetch list. Error: ${error.message}`);
        }
    }

    // Warning commands (existing)
    if (command === 'warn') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to warn.");
        try {
            const reason = args.slice(1).join(' ') || 'No reason provided';
            if (!warns[member.id]) warns[member.id] = [];
            warns[member.id].push(reason);
            saveFile('warns.json', warns);
            message.reply(`✅ Successfully warned ${member.user.tag}: ${reason}`);
        } catch (error) {
            message.reply(`❌ Failed to warn ${member.user.tag}. Error: ${error.message}`);
        }
    }

    if (command === 'warnings') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user.");
        try {
            const userWarns = warns[member.id] || [];
            if (userWarns.length === 0) {
                message.reply("✅ No warnings found for this user.");
            } else {
                message.reply(`✅ Warnings for ${member.user.tag}:\n${userWarns.map((warn, index) => `${index + 1}. ${warn}`).join('\n')}`);
            }
        } catch (error) {
            message.reply(`❌ Failed to retrieve warnings. Error: ${error.message}`);
        }
    }

    if (command === 'clearwarnings') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user.");
        try {
            if (!warns[member.id] || warns[member.id].length === 0) {
                return message.reply(`❌ ${member.user.tag} has no warnings to clear.`);
            }
            delete warns[member.id];
            saveFile('warns.json', warns);
            message.reply(`✅ Successfully cleared all warnings for ${member.user.tag}`);
        } catch (error) {
            message.reply(`❌ Failed to clear warnings. Error: ${error.message}`);
        }
    }

    if (command === 'removewarning') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        const warningIndex = parseInt(args[1]);
        if (!member) return message.reply("❌ Usage: $removewarning @user <warning_number>");
        if (!warningIndex || warningIndex < 1) return message.reply("❌ Please specify a valid warning number (starting from 1).");
        
        try {
            const userWarns = warns[member.id] || [];
            if (userWarns.length === 0) return message.reply("❌ This user has no warnings.");
            if (warningIndex > userWarns.length) return message.reply(`❌ This user only has ${userWarns.length} warning(s).`);
            
            const removedWarning = userWarns.splice(warningIndex - 1, 1)[0];
            if (userWarns.length === 0) {
                delete warns[member.id];
            } else {
                warns[member.id] = userWarns;
            }
            saveFile('warns.json', warns);
            message.reply(`✅ Successfully removed warning #${warningIndex} from ${member.user.tag}: "${removedWarning}"`);
        } catch (error) {
            message.reply(`❌ Failed to remove warning. Error: ${error.message}`);
        }
    }

    // AFK command
    if (command === 'afk') {
        const reason = args.join(' ') || 'AFK';
        afkUsers[message.author.id] = {
            reason: reason,
            time: Date.now()
        };
        message.reply(`✅ You are now AFK: ${reason}`);
    }

    // Owner commands
    if (command === 'addowner') {
        if (message.author.id !== OWNER_ID) 
            return message.reply("❌ Only the main bot owner can add additional owners.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to add as owner.");
        if (additionalOwners.includes(member.id)) 
            return message.reply("❌ This user is already an additional owner.");
        try {
            additionalOwners.push(member.id);
            saveFile('owners.json', additionalOwners);
            message.reply(`✅ Successfully added ${member.user.tag} as an additional bot owner.`);
        } catch (error) {
            message.reply(`❌ Failed to add owner. Error: ${error.message}`);
        }
    }

    if (command === 'removeowner') {
        if (message.author.id !== OWNER_ID) 
            return message.reply("❌ Only the main bot owner can remove additional owners.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to remove as owner.");
        const index = additionalOwners.indexOf(member.id);
        if (index === -1) 
            return message.reply("❌ This user is not an additional owner.");
        try {
            additionalOwners.splice(index, 1);
            saveFile('owners.json', additionalOwners);
            message.reply(`✅ Successfully removed ${member.user.tag} from additional bot owners.`);
        } catch (error) {
            message.reply(`❌ Failed to remove owner. Error: ${error.message}`);
        }
    }

    // Help command
    if (command === 'help') {
        const helpEmbed = {
            color: 0x0099ff,
            title: '🔧 Advanced Moderation Bot Commands',
            description: 'Here are all available commands:',
            fields: [
                {
                    name: '🔨 Basic Moderation',
                    value: '`$ban @user [reason]` - Ban a member\n`$unban <user_id>` - Unban a user\n`$kick @user [reason]` - Kick a member\n`$mute @user <time>` - Mute a member\n`$unmute @user` - Unmute a member\n`$nick @user [nickname]` - Change nickname',
                    inline: false
                },
                {
                    name: '🤖 AutoMod',
                    value: '`$automod config enable/disable` - Toggle automod\n`$automod config antispam true/false` - Anti-spam\n`$automod config antilinks true/false` - Anti-links\n`$automod config anticaps true/false` - Anti-caps',
                    inline: false
                },
                {
                    name: '🔇 Channel Management',
                    value: '`$lock` - Lock current channel\n`$unlock` - Unlock current channel\n`$ignore channel [#channel]` - Ignore channel from automod\n`$ignore user @user` - Whitelist user from automod',
                    inline: false
                },
                {
                    name: '📋 Whitelist Management',
                    value: '`$whitelist role add/remove @role` - Manage role whitelist\n`$whitelist user add/remove @user` - Manage user whitelist',
                    inline: false
                },
                {
                    name: '🧹 Advanced Purge',
                    value: '`$purge <number>` - Delete messages\n`$purge bots <number>` - Delete bot messages\n`$purge humans <number>` - Delete human messages\n`$purge mentions <number>` - Delete mention messages\n`$purge emojis <number>` - Delete emoji messages\n`$purge stickers <number>` - Delete sticker messages\n`$purge contains <number> <text>` - Delete messages containing text\n`$purge attachments <number>` - Delete messages with files\n`$purge links <number>` - Delete messages with links',
                    inline: false
                },
                {
                    name: '📊 Lists',
                    value: '`$list bans` - Show banned users\n`$list roles` - Show server roles\n`$list channels` - Show text channels\n`$list muted` - Show muted users',
                    inline: false
                },
                {
                    name: '⚠️ Warnings',
                    value: '`$warn @user <reason>` - Warn a member\n`$warnings @user` - Check warnings\n`$removewarning @user <number>` - Remove specific warning\n`$clearwarnings @user` - Clear all warnings',
                    inline: false
                },
                {
                    name: '👑 Owner & Utility',
                    value: '`$addowner @user` - Add bot owner\n`$removeowner @user` - Remove bot owner\n`$afk [reason]` - Set AFK status\n`$help` - Show this menu',
                    inline: false
                }
            ],
            footer: {
                text: 'Advanced Discord Moderation Bot • Main Owner and Additional Owners bypass all permission checks'
            }
        };
        message.reply({ embeds: [helpEmbed] });
    }
});

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`🔧 Advanced moderation features loaded`);
    
    // Set bot activity
    client.user.setActivity('$help for commands', { type: 'WATCHING' });
});

client.login(TOKEN);
