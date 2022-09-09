all: build
deploy: build
	npx aws-cdk deploy --app "npx ts-node index.ts"
build:
	yarn install
	npx aws-cdk synth --app "npx ts-node index.ts" 