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

function hasPermission(message, permission) {
    if (message.author.id === OWNER_ID) return true;
    return message.member.permissions.has(permission);
}

function missingPerm(message, permName) {
    return message.reply(`❌ You need the "${permName}" permission to use this command.`);
}

client.on('messageCreate', async message => {
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
});

client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(TOKEN);
