import * as cdk from 'aws-cdk-lib'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as s3 from 'aws-cdk-lib/aws-s3'
// Support for glue is still in alpha. See:
// - https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_glue-readme.html
// - https://constructs.dev/packages/@aws-cdk/aws-glue-alpha/v/2.22.0-alpha.0?lang=typescript
import * as glue from '@aws-cdk/aws-glue-alpha'
import * as iam from 'aws-cdk-lib/aws-iam'

export class ServerStatus extends cdk.Stack {
  constructor(app: cdk.App, id: string) {
    super(app, id);

    const serverStatusLambda = new lambda.Function(this, 'ServerStatus', {
      code: lambda.Code.fromAsset('./handler'),
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.NODEJS_14_X,
      retryAttempts: 0,
      environment: {
        "CLOUDWATCH_METRICS": this.node.tryGetContext('CLOUDWATCH_METRICS'),
        "MASTER_IP": this.node.tryGetContext('MASTER_IP')
      }
    });

    serverStatusLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.expression('rate(1 minute)')
    });
    rule.addTarget(new targets.LambdaFunction(serverStatusLambda));

    const bucket = new s3.Bucket(this, 'q3quest-api',{
      versioned: false,
      bucketName: 'q3quest-api',
      publicReadAccess: true
    });
    bucket.grantReadWrite(serverStatusLambda);

    const historicalDataBucket = new s3.Bucket(this, 'q3quest-historical-data',{
      versioned: false,
      bucketName: 'q3quest-historical-data',
      publicReadAccess: false
    });
    historicalDataBucket.grantReadWrite(serverStatusLambda); 

    new s3.Bucket(this, 'q3quest-athena-results',{
      versioned: false,
      bucketName: 'q3quest-athena-results',
      publicReadAccess: false
    });

    const q3questdb = new glue.Database(this, "Q3QuestDb", {
      databaseName: "q3questdb",
    });
    
    new glue.Table(this, "servers", {
      database: q3questdb,
      tableName: "servers",
      bucket: historicalDataBucket,
      s3Prefix: "servers",
      partitionKeys: [{
        name: 'dt',
        type: glue.Schema.STRING,
      }],
      columns: [
        {
          name: "tstamp",
          type: glue.Schema.TIMESTAMP
        },
        {
          name: "hostname",
          type: glue.Schema.STRING,
        },
        {
          name: "ip",
          type: glue.Schema.STRING,
        },
        {
          name: "humanPlayers",
          type: glue.Schema.TINY_INT,
        },
        {
          name: "maxPlayers",
          type: glue.Schema.TINY_INT,
        },
      ],
      dataFormat: glue.DataFormat.JSON,
    });
    
  }
}

const app = new cdk.App();
new ServerStatus(app, 'Quake3Quest-ServerStatus');
app.synth();
