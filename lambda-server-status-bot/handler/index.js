const AWS = require('aws-sdk')
const s3 = new AWS.S3();
const request = require('request-promise');
const { Client, Intents, MessageEmbed } = require("discord.js");
const DEBUG = process.env.DEBUG

function InactiveServersdEmbed(serverStatus) {
    const inactiveServers = serverStatus.filter(s => s.humanPlayers == 0)
    this.color = 0x0099ff;
    this.title = "Inactive Servers";
    this.description = `These servers are currently empty.`;
    this.fields = [
            {name: "\u200b",value: "\u200b"},
            {name: "Players",value: inactiveServers.map(server => `${server.humanPlayers} / ${server.maxPlayers}`).join("\n"), inline: true},
            {name: "Server",value: inactiveServers.map(server => server.hostname).join("\n"), inline: true}
        ]
    this.timestamp = new Date();
}

function ActiveServersEmbed(serverStatus) {
    const activeServers = serverStatus.filter(s => s.humanPlayers > 0)

    this.color = 0x0099ff;
    this.title = "Active Servers";
    this.description = activeServers.length ? `There ${activeServers.length == 1 ? "is 1 server": "are " + activeServers.length + " servers" } currently active` : `There is no one playing at the moment :-(`;
    this.fields = activeServers.flatMap(server => {
        return [
            {name: "\u200b",value: "\u200b"},
            {name: `${server.hostname}  (${server.humanPlayers} / ${server.maxPlayers})`,value: "\u200b"},
            {name: "Players",value: '```\n' + server.players.map(p => `${p.score < 10 ? " " + p.score : p.score} ${p.name}`).join("\n") + '\n```', inline: true},
            {name: "Map",value: `${server.mapName}`, inline: true},
            {name: "Game",value: `${server.gameTypeName}`, inline: true},
        ]
    })
    
            
    this.timestamp = new Date();
}

async function postUpdateToDiscord(discordToken, discordChannel, activeServerEmbed, inactiveServerEmbed) {
    return new Promise((resolve, reject) => {
        const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
        client.login(discordToken);
        client.once("ready", async () => {
            DEBUG && console.log("in!");
            const channel = await client.channels.fetch(discordChannel);
            const messages = await client.channels.cache.get(discordChannel).messages.fetch();

                        // get the newest message by the user
                        const inactiveServerStatusMessage = messages
                        .filter((msg) => msg.embeds.length > 0)
                        .filter((m) => m.embeds[0].title === inactiveServerEmbed.title)
                        .first();
                    
                    // if a message already exists
                    if (inactiveServerStatusMessage)
                        // edit it
                        await inactiveServerStatusMessage.edit({ embed: inactiveServerEmbed });
                    else
                        // otherwise, create new message
                        await channel.send({ embed: inactiveServerEmbed })

            // get the newest message by the user
            const activeServerStatusMessage = messages
                .filter((msg) => msg.embeds.length > 0)
                .filter((m) => m.embeds[0].title === activeServerEmbed.title)
                .first();
            
            // if a message already exists
            if (activeServerStatusMessage)
                // edit it
                await activeServerStatusMessage.edit({ embed: activeServerEmbed });
            else
                // otherwise, create new message
                await channel.send({ embed: activeServerEmbed })

            client.destroy();
            resolve("OK")
        });
    })
  }
  
exports.handler = async (event) => {
    try {
        const discordToken = process.env.DISCORD_TOKEN || "failfast"
        const discordChannel = process.env.DISCORD_CHANNEL || "failfast"

        const serverStatus = await request('https://q3quest-api.s3.eu-west-3.amazonaws.com/serverstatus', { json: true })
        DEBUG && console.log(serverStatus)
        const activeServerEmbed = new ActiveServersEmbed(serverStatus)
        const inactiveServerEmbed = new InactiveServersdEmbed(serverStatus)
        DEBUG && console.log(activeServerEmbed)
        DEBUG && console.log(inactiveServerEmbed)
        await postUpdateToDiscord(discordToken, discordChannel, activeServerEmbed, inactiveServerEmbed)
        
        return {
            statusCode: 200,
            body: JSON.stringify('SUCCESS')

        }
    }
    catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify(error)

        }

    }
}

if (require.main === module) {
	void (async () => console.log(await this.handler()))();
}