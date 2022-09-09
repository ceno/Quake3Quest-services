# Quake3Quest services

### lambda-server-status

Live status data feed. Produces a public API for consumption by clients, and keeps historical data for trend analysis.

### lambda-server-status-bot

Uses the public API to post a live view of all quake3quest multiplayer servers in the discord.

### lambda-leaderboard-bot

Fetches the plain text leaderboards produced by
[each server](https://github.com/ceno/Quake3Quest-servers/blob/main/scripts/leaderboard/leaderboard.sh)
and post thems as a nicely formatted message in the discord.