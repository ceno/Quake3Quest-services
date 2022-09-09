import * as cdk from 'aws-cdk-lib'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as lambda from 'aws-cdk-lib/aws-lambda'

export class LeaderboardBot extends cdk.Stack {
  constructor(app: cdk.App, id: string) {
    super(app, id);

    const leaderboardBot = new lambda.Function(this, 'LeaderboardBot', {
      code: lambda.Code.fromAsset('./handler'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.NODEJS_14_X,
      retryAttempts: 0,
      environment: {
        "DISCORD_TOKEN": this.node.tryGetContext('DISCORD_TOKEN'),
        "DISCORD_CHANNEL": this.node.tryGetContext('DISCORD_CHANNEL'),
        "PRIVATE_KEY": this.node.tryGetContext('PRIVATE_KEY')
      }
    });

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.expression('rate(5 minutes)')
    });

    rule.addTarget(new targets.LambdaFunction(leaderboardBot));
  }
}

const app = new cdk.App();
new LeaderboardBot(app, 'Quake3Quest-LeaderboardBot');
app.synth();
