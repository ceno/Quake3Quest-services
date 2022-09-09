const fs = require('fs');
const os = require('os');
const SSH2Promise = require('ssh2-promise');
const { Client, Intents, MessageEmbed } = require("discord.js");

const DEBUG = process.env.DEBUG
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "failfast"
const DISCORD_CHANNEL = process.env.DISCORD_CHANNEL || "failfast"
const PRIVATE_KEY = process.env.PRIVATE_KEY || fs.readFileSync(`${os.homedir()}/.ssh/leaderboard.pem`, "utf8")

const today = new Date()
const todayStr = today.toISOString().slice(0,10)
const lastMonday = today.getDay() == 0
  ? new Date().setDate(today.getDate() - 6)
  : new Date().setDate(today.getDate() - (today.getDay() - 1))

function ScoreboardEmbed(title, daily, weekly) {
  const getNumbers = (score) => score.map((o) => o.num).join("\n").substring(0,1000) || "0"
  const getDescription = (score) => score.map((o) => o.description.replace(/\^\d/ig, '')).join("\n").substring(0,1000) || "No games today yet!"

  this.color = 0x0099ff;
  this.title = title;
  this.description = `For the week of ${new Date(lastMonday).toLocaleString('en-US', { month: 'long', day: 'numeric'})}`;
  this.thumbnail = { url: "https://i.imgur.com/d8yfpu4.png" };
  this.fields = [
    {name: "\u200b",value: "\u200b"},
		{ name: 'DAILY', value: '\u200B' },
    {name: "Wins",value: getNumbers(daily.wins),inline: true},
    {name: "Player",value: getDescription(daily.wins),inline: true,},
    {name: "\u200b",value: "\u200b",inline: true,},
    {name: "Kills",value: getNumbers(daily.kills),inline: true,},
    {name: "Player",value: getDescription(daily.kills),inline: true,},
    {name: "\u200b",value: "\u200b",inline: true,},
    {name: "\u200b",value: "\u200b"},
    { name: 'AWARDS', value: '\u200B' },
    {name: "Hits",value: getNumbers(daily.awards),inline: true},
    {name: "Award",value: getDescription(daily.awards),inline: true},
    {name: "\u200b",value: "\u200b",inline: true,},
    {name: "\u200b",value: "\u200b"},
    { name: 'WEEKLY', value: '\u200B' },
    {name: "Wins",value: getNumbers(weekly.wins),inline: true},
    {name: "Player",value: getDescription(weekly.wins),inline: true,},
    {name: "\u200b",value: "\u200b",inline: true,},
    {name: "Kills",value: getNumbers(weekly.kills),inline: true,},
    {name: "Player",value: getDescription(weekly.kills),inline: true,},
    {name: "\u200b",value: "\u200b",inline: true,},
  ];
  this.timestamp = new Date();
}

async function postUpdateToDiscord(discordToken, discordChannel, embed) {
    return new Promise((resolve, reject) => {
        const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
        client.login(discordToken);
        client.once("ready", async () => {
            DEBUG && console.log("in!");

            const channel = await client.channels.fetch(discordChannel);
            const messages = await client.channels.cache.get(discordChannel).messages.fetch();

            // get the newest message that matches the title of this embed
            const message = messages
            .filter((msg) => msg.embeds.length > 0)
            .filter((m) => m.embeds[0].title === embed.title)
            .first();
        
            // ! if a message already exists edit it, otherwise post new one
            if (message)
                await message.edit({ embed: embed });
            else
                await channel.send({ embed: embed })

            client.destroy();
            resolve("OK")
        });
    })
  }
  
  function isHuman(stats) {
    const bots = ["<world>","Orbb", "Phobos", "Visor", "Slash", "Tig"
    ,"Keel"
    ,"Gorre"
    ,"TankJr"
    ,"Razor"
    ,"Bones"
    ,"Orbb"
    ,"Xaero"
    ,"Sorlag"
    ,"Stripe"
    ,"Major"
    ,"Lucy"
    ,"Sarge"
    ,"Hossman"
    ,"Grunt"
    ,"Hunter"
    ,"Klesk"
    ,"Bitterman"
    ,"Cadavre"
    ,"Ranger"
    ,"Angel"
    ,"Biker"
    ,"Daemia"
    ,"Crash"
    ,"Angel"
    ,"Mynx"
    ,"^1A^2n^3a^4r^5k^6i"
    ,"Doom", "[VR] Player", "VR_Player"]
    return !bots.includes(stats.description.trim())
  }
  
async function fetchWeeklyStats(serverIp) {
  const fileList = (type) => {
    const rollingWindow = [0,1,2,3,4,5,6].map( i => (new Date(new Date().setDate(new Date().getDate()-i))))
    const daysSinceMonday = today.getDay() == 0
      ? rollingWindow // if sunday
      : rollingWindow.filter(d => d.getDay() >= 1 && d.getDay() <= today.getDay()) // if not sunday
    
    return daysSinceMonday.map(d => `/mnt/${d.toISOString().slice(0,10)}-${type}.txt`).join(" ")
  }

  const wins = await fetchDataFromServer(serverIp, `cat ${fileList("wins")} || true 2>/dev/null`)
  const kills = await fetchDataFromServer(serverIp, `cat ${fileList("kills")} || true 2>/dev/null`)

  return {wins, kills}
}

async function fetchDataFromServer(ip, cmd) {
  const consolidateDuplicatePlayerNames = (data) => {
    const merged = data.reduce((acc, cur) =>
      (acc[cur.description] = acc[cur.description] ? acc[cur.description] + cur.num : cur.num, acc)
    , {})
    const arr = Object.entries(merged)
    return arr.map(o => ({description:o[0], num: o[1]}))
       .sort((a,b) => (b.num - a.num))
  }

  var ssh = new SSH2Promise({
    host: ip,
    username: 'ec2-user',
    privateKey: PRIVATE_KEY
  })
  var textFile = await ssh.exec(cmd)

  const structuredData = textFile
    .split("\n")
    .filter(x => x.length)
    .map((str) => ({
      description: str.trim().split(' ').slice(1).join(' ').replace(/\^\d/ig, ''),
      num:  Number(str.trim().split(' ').slice(0,1)),
    }))
    .filter(isHuman);

  const consolidatedData = consolidateDuplicatePlayerNames(structuredData)
  return consolidatedData
}
  
async function fetchDailyStats(serverIp) {
  const wins = await fetchDataFromServer(serverIp, `cat /mnt/${todayStr}-wins.txt`)
  const kills = await fetchDataFromServer(serverIp, `cat /mnt/${todayStr}-kills.txt`)
  const awards = await fetchDataFromServer(serverIp, `cat /mnt/${todayStr}-awards.txt`)

  return {wins, kills, awards}
}

exports.handler = async (event) => {
  const daily = await fetchDailyStats('13.38.149.128')
  const weekly = await fetchWeeklyStats('13.38.149.128')
  const leaderboardEmbed = new ScoreboardEmbed("🇪🇺  EU server Leaderboard", daily, weekly)
  DEBUG && console.log(leaderboardEmbed)
  await postUpdateToDiscord(DISCORD_TOKEN, DISCORD_CHANNEL, leaderboardEmbed)

  const dailyUs = await fetchDailyStats('50.18.47.157')
  const weeklyUs = await fetchWeeklyStats('50.18.47.157')
  const leaderboardEmbedUs = new ScoreboardEmbed("🇺🇸 US server Leaderboard", dailyUs, weeklyUs)
  DEBUG && console.log(leaderboardEmbedUs)
  await postUpdateToDiscord(DISCORD_TOKEN, DISCORD_CHANNEL, leaderboardEmbedUs)
}

if (require.main === module) {
	void (async () => console.log(await this.handler()))();
}