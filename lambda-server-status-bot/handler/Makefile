all: build
build:
	yarn install
test: build
	DEBUG=true DISCORD_TOKEN=changeme DISCORD_CHANNEL=changeme node index.js
