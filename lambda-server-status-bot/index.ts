import * as cdk from 'aws-cdk-lib'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as lambda from 'aws-cdk-lib/aws-lambda'

export class ServerStatusBot extends cdk.Stack {
  constructor(app: cdk.App, id: string) {
    super(app, id);

    const serverStatusBot = new lambda.Function(this, 'ServerStatusBot', {
      code: lambda.Code.fromAsset('./handler'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.NODEJS_14_X,
      retryAttempts: 0,
      environment: {
        "DISCORD_TOKEN": this.node.tryGetContext('DISCORD_TOKEN'),
        "DISCORD_GUILD": this.node.tryGetContext('DISCORD_GUILD'),
        "DISCORD_CHANNEL": this.node.tryGetContext('DISCORD_CHANNEL')
      }
    });

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.expression('rate(1 minute)')
    });

    rule.addTarget(new targets.LambdaFunction(serverStatusBot));
  }
}

const app = new cdk.App();
new ServerStatusBot(app, 'Quake3Quest-ServerStatusBot');
app.synth();
