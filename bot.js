
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const ms = require('ms');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

let warns = JSON.parse(fs.readFileSync('warns.json', 'utf8'));
let mutes = JSON.parse(fs.readFileSync('mutes.json', 'utf8'));
let afkUsers = {};

function hasPermission(message, permission) {
    if (message.author.id === OWNER_ID) return true;
    return message.member.permissions.has(permission);
}

function missingPerm(message, permName) {
    return message.reply(`❌ You need the "${permName}" permission to use this command.`);
}

client.on('messageCreate', async message => {
    // Check if user is returning from AFK
    if (afkUsers[message.author.id] && !message.content.startsWith('$afk')) {
        const afkData = afkUsers[message.author.id];
        const timeDiff = Math.floor((Date.now() - afkData.time) / 1000 / 60); // minutes
        delete afkUsers[message.author.id];
        message.reply(`👋 Welcome back! You were AFK for ${timeDiff} minute(s): ${afkData.reason}`);
    }

    // Check if someone mentioned an AFK user
    message.mentions.users.forEach(user => {
        if (afkUsers[user.id]) {
            const afkData = afkUsers[user.id];
            const timeDiff = Math.floor((Date.now() - afkData.time) / 1000 / 60); // minutes
            message.reply(`💤 ${user.username} is currently AFK (${timeDiff} minute(s) ago): ${afkData.reason}`);
        }
    });

    if (!message.content.startsWith('$') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'ban') {
        if (!hasPermission(message, PermissionsBitField.Flags.BanMembers))
            return missingPerm(message, "Ban Members");
        const member = message.mentions.members.first();
        if (!member) return message.reply("Please mention a user to ban.");
        await member.ban({ reason: args.slice(1).join(' ') || 'No reason provided' });
        message.reply(`✅ Banned ${member.user.tag}`);
    }

    if (command === 'unban') {
        if (!hasPermission(message, PermissionsBitField.Flags.BanMembers))
            return missingPerm(message, "Ban Members");
        const userId = args[0];
        if (!userId) return message.reply("Please provide a user ID to unban.");
        try {
            await message.guild.members.unban(userId);
            message.reply(`✅ Unbanned user with ID: ${userId}`);
        } catch (error) {
            message.reply("❌ Could not unban user. Make sure the ID is correct and the user is banned.");
        }
    }

    if (command === 'kick') {
        if (!hasPermission(message, PermissionsBitField.Flags.KickMembers))
            return missingPerm(message, "Kick Members");
        const member = message.mentions.members.first();
        if (!member) return message.reply("Please mention a user to kick.");
        await member.kick(args.slice(1).join(' ') || 'No reason provided');
        message.reply(`✅ Kicked ${member.user.tag}`);
    }

    if (command === 'mute') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageRoles))
            return missingPerm(message, "Manage Roles");
        const member = message.mentions.members.first();
        const time = args[1];
        if (!member || !time) return message.reply("Usage: $mute @user 10m");
        const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted') || 
            await message.guild.roles.create({ name: 'Muted', permissions: [] });
        await member.roles.add(muteRole);
        mutes[member.id] = Date.now() + ms(time);
        fs.writeFileSync('mutes.json', JSON.stringify(mutes, null, 2));
        message.reply(`✅ Muted ${member.user.tag} for ${time}`);
    }

    if (command === 'unmute') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageRoles))
            return missingPerm(message, "Manage Roles");
        const member = message.mentions.members.first();
        if (!member) return message.reply("Please mention a user to unmute.");
        const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
        if (muteRole) await member.roles.remove(muteRole);
        delete mutes[member.id];
        fs.writeFileSync('mutes.json', JSON.stringify(mutes, null, 2));
        message.reply(`✅ Unmuted ${member.user.tag}`);
    }

    if (command === 'warn') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        if (!member) return message.reply("Please mention a user to warn.");
        const reason = args.slice(1).join(' ') || 'No reason provided';
        if (!warns[member.id]) warns[member.id] = [];
        warns[member.id].push(reason);
        fs.writeFileSync('warns.json', JSON.stringify(warns, null, 2));
        message.reply(`⚠️ Warned ${member.user.tag}: ${reason}`);
    }

    if (command === 'warnings') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        if (!member) return message.reply("Please mention a user.");
        const userWarns = warns[member.id] || [];
        message.reply(userWarns.length ? userWarns.join('\n') : "No warnings.");
    }

    if (command === 'clearwarnings') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        if (!member) return message.reply("Please mention a user.");
        delete warns[member.id];
        fs.writeFileSync('warns.json', JSON.stringify(warns, null, 2));
        message.reply(`✅ Cleared warnings for ${member.user.tag}`);
    }

    if (command === 'purge') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const count = parseInt(args[0]);
        if (!count) return message.reply("Please specify number of messages to delete.");
        await message.channel.bulkDelete(count, true);
        message.reply(`✅ Deleted ${count} messages.`);
    }

    if (command === 'afk') {
        const reason = args.join(' ') || 'AFK';
        afkUsers[message.author.id] = {
            reason: reason,
            time: Date.now()
        };
        message.reply(`✅ You are now AFK: ${reason}`);
    }

    if (command === 'help') {
        const helpEmbed = {
            color: 0x0099ff,
            title: '🔧 Moderation Bot Commands',
            description: 'Here are all available commands:',
            fields: [
                {
                    name: '🔨 Moderation',
                    value: '`$ban @user [reason]` - Ban a member\n`$unban <user_id>` - Unban a user by ID\n`$kick @user [reason]` - Kick a member\n`$mute @user <time>` - Mute a member (e.g., 10m, 1h)\n`$unmute @user` - Unmute a member',
                    inline: false
                },
                {
                    name: '⚠️ Warnings',
                    value: '`$warn @user <reason>` - Warn a member\n`$warnings @user` - Check warnings for a user\n`$clearwarnings @user` - Clear all warnings for a user',
                    inline: false
                },
                {
                    name: '🧹 Utility',
                    value: '`$purge <number>` - Delete multiple messages\n`$afk [reason]` - Set yourself as AFK\n`$help` - Show this help menu',
                    inline: false
                }
            ],
            footer: {
                text: 'Bot Owner has access to all commands regardless of permissions'
            }
        };
        message.reply({ embeds: [helpEmbed] });
    }
});

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
