
require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
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
    if (message.author.id === OWNER_ID || additionalOwners.includes(message.author.id)) return true;
    return message.member.permissions.has(permission);
}

function isOwner(userId) {
    return userId === OWNER_ID || additionalOwners.includes(userId);
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
            fs.writeFileSync('mutes.json', JSON.stringify(mutes, null, 2));
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
            fs.writeFileSync('mutes.json', JSON.stringify(mutes, null, 2));
            message.reply(`✅ Successfully unmuted ${member.user.tag}`);
        } catch (error) {
            message.reply(`❌ Failed to unmute ${member.user.tag}. Error: ${error.message}`);
        }
    }

    if (command === 'warn') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to warn.");
        try {
            const reason = args.slice(1).join(' ') || 'No reason provided';
            if (!warns[member.id]) warns[member.id] = [];
            warns[member.id].push(reason);
            fs.writeFileSync('warns.json', JSON.stringify(warns, null, 2));
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
            fs.writeFileSync('warns.json', JSON.stringify(warns, null, 2));
            message.reply(`✅ Successfully cleared all warnings for ${member.user.tag}`);
        } catch (error) {
            message.reply(`❌ Failed to clear warnings. Error: ${error.message}`);
        }
    }

    if (command === 'purge') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const count = parseInt(args[0]);
        if (!count || count < 1) return message.reply("❌ Please specify a valid number of messages to delete (1-100).");
        if (count > 100) return message.reply("❌ Cannot delete more than 100 messages at once.");
        try {
            const deletedMessages = await message.channel.bulkDelete(count, true);
            message.reply(`✅ Successfully deleted ${deletedMessages.size} messages.`);
        } catch (error) {
            message.reply(`❌ Failed to delete messages. Error: ${error.message}`);
        }
    }

    if (command === 'afk') {
        const reason = args.join(' ') || 'AFK';
        afkUsers[message.author.id] = {
            reason: reason,
            time: Date.now()
        };
        message.reply(`✅ You are now AFK: ${reason}`);
    }

    if (command === 'addowner') {
        if (message.author.id !== OWNER_ID) 
            return message.reply("❌ Only the main bot owner can add additional owners.");
        const member = message.mentions.members.first();
        if (!member) return message.reply("❌ Please mention a user to add as owner.");
        if (additionalOwners.includes(member.id)) 
            return message.reply("❌ This user is already an additional owner.");
        try {
            additionalOwners.push(member.id);
            fs.writeFileSync('owners.json', JSON.stringify(additionalOwners, null, 2));
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
            fs.writeFileSync('owners.json', JSON.stringify(additionalOwners, null, 2));
            message.reply(`✅ Successfully removed ${member.user.tag} from additional bot owners.`);
        } catch (error) {
            message.reply(`❌ Failed to remove owner. Error: ${error.message}`);
        }
    }

    if (command === 'removewarning') {
        if (!hasPermission(message, PermissionsBitField.Flags.ManageMessages))
            return missingPerm(message, "Manage Messages");
        const member = message.mentions.members.first();
        const warningIndex = parseInt(args[1]);
        if (!member) return message.reply("Usage: $removewarning @user <warning_number>");
        if (!warningIndex || warningIndex < 1) return message.reply("Please specify a valid warning number (starting from 1).");
        
        const userWarns = warns[member.id] || [];
        if (userWarns.length === 0) return message.reply("❌ This user has no warnings.");
        if (warningIndex > userWarns.length) return message.reply(`❌ This user only has ${userWarns.length} warning(s).`);
        
        const removedWarning = userWarns.splice(warningIndex - 1, 1)[0];
        if (userWarns.length === 0) {
            delete warns[member.id];
        } else {
            warns[member.id] = userWarns;
        }
        fs.writeFileSync('warns.json', JSON.stringify(warns, null, 2));
        message.reply(`✅ Successfully removed warning #${warningIndex} from ${member.user.tag}: "${removedWarning}"`);
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
                    value: '`$warn @user <reason>` - Warn a member\n`$warnings @user` - Check warnings for a user\n`$removewarning @user <number>` - Remove specific warning\n`$clearwarnings @user` - Clear all warnings for a user',
                    inline: false
                },
                {
                    name: '👑 Owner Commands',
                    value: '`$addowner @user` - Add additional bot owner\n`$removeowner @user` - Remove additional bot owner',
                    inline: false
                },
                {
                    name: '🧹 Utility',
                    value: '`$purge <number>` - Delete multiple messages\n`$afk [reason]` - Set yourself as AFK\n`$help` - Show this help menu',
                    inline: false
                }
            ],
            footer: {
                text: 'Main Owner and Additional Owners have access to all commands regardless of permissions'
            }
        };
        message.reply({ embeds: [helpEmbed] });
    }
});

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
