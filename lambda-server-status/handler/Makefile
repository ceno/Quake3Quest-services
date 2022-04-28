all: build
build:
	yarn install
test: build
	DEBUG=true CLOUDWATCH_METRICS="[{\"name\":\"Global\",\"ip\":\".\"}]" MASTER_IP=changeme node index.js
