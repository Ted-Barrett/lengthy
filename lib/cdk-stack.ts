import * as cdk from "aws-cdk-lib";
import { AttributeType, Billing, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import { Construct } from "constructs";
import {
  aws_dynamodb as dynamodb,
  aws_certificatemanager as certificates,
  aws_route53_targets as targets,
  aws_apigateway as api,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_event_sources as lambdaEventSources,
  aws_s3 as s3,
  aws_s3_notifications as s3Notifications,
  aws_sqs as sqs,
} from "aws-cdk-lib";

export class LengthyCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    const stage = "prod";

    super(scope, id, props);

    const mainTable = new dynamodb.TableV2(this, `lengthy-${stage}`, {
      tableName: `lengthy-${stage}`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.BINARY },
      billing: dynamodb.Billing.onDemand({
        maxReadRequestUnits: 400,
        maxWriteRequestUnits: 100,
      }),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const lambdaExecutionRole = new iam.Role(
      this,
      "LengthyLambdaExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:ConditionCheckItem",
          "dynamodb:PutItem",
          "dynamodb:DescribeTable",
          "dynamodb:DeleteItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
        ],
        resources: [mainTable.tableArn],
      })
    );

    const apiLambda = new lambda.Function(this, "lengthyApiLambda", {
      functionName: `LengthyLambda-${stage}`,
      role: lambdaExecutionRole,
      memorySize: 128,
      runtime: lambda.Runtime.PROVIDED_AL2023,
      handler: "main",
      architecture: lambda.Architecture.X86_64,
      retryAttempts: 0,
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambda/target/lambda/lambda/bootstrap.zip")
      ),
      timeout: cdk.Duration.seconds(1),
    });

    const lengthyHostname = "cccccccccccccccccccccccccccccccccccccccc.cc";

    const certificate = certificates.Certificate.fromCertificateArn(
      this,
      "LengthyCertificate",
      "arn:aws:acm:us-west-2:728931088524:certificate/a77d3131-4923-48e2-b094-bfec8a337d3e"
    );

    const restApi = new api.LambdaRestApi(this, "LengthyRESTAPI", {
      handler: apiLambda,
      domainName: {
        certificate: certificate,
        domainName: lengthyHostname,
      },
      deployOptions: {
        stageName: "",
      },
    });
  }
}
