import * as cdk from "aws-cdk-lib";
import * as path from "path";
import { Construct } from "constructs";
import {
  aws_logs as logs,
  aws_dynamodb as dynamodb,
  aws_certificatemanager as certificates,
  aws_apigateway as api,
  aws_iam as iam,
  aws_lambda as lambda,
} from "aws-cdk-lib";
import "dotenv/config";

function assertDefined<t>(value: t): asserts value is Exclude<t, undefined> {
  if (value === undefined) {
    throw new Error("The value should not be undefined");
  }
}

export class LengthyCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    const stage = "prod";
    const LENGTHY_HOSTNAME = process.env.LENGTHY_HOSTNAME;
    const LENGTHY_CERTIFICATE_ARN = process.env.LENGTHY_CERTIFICATE_ARN;
    assertDefined(LENGTHY_HOSTNAME);
    assertDefined(LENGTHY_CERTIFICATE_ARN);

    super(scope, id, props);

    const mainTable = new dynamodb.TableV2(this, `lengthy-${stage}`, {
      tableName: `lengthy-${stage}`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.BINARY },
      billing: dynamodb.Billing.onDemand({
        maxReadRequestUnits: 400,
        maxWriteRequestUnits: 100,
      }),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const lambdaExecutionRole = new iam.Role(
      this,
      "LengthyLambdaExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole",
          ),
        ],
      },
    );
    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:DescribeTable",
          "dynamodb:GetItem",
        ],
        resources: [mainTable.tableArn],
      }),
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
        path.join(__dirname, "../lambda/dist/out.zip"),
      ),
      timeout: cdk.Duration.seconds(1),
      reservedConcurrentExecutions: 10,
    });

    const certificate = certificates.Certificate.fromCertificateArn(
      this,
      "LengthyCertificate",
      LENGTHY_CERTIFICATE_ARN,
    );

    const logGroup = new logs.LogGroup(this, "AccessLogGroup", {
      retention: logs.RetentionDays.ONE_WEEK, // Retention period for logs (you can change it)
    });

    new api.LambdaRestApi(this, "LengthyRESTAPI", {
      handler: apiLambda,
      domainName: {
        certificate: certificate,
        domainName: LENGTHY_HOSTNAME,
      },
      binaryMediaTypes: ["image/*"],
      deployOptions: {
        throttlingRateLimit: 5,
        throttlingBurstLimit: 500,
        accessLogDestination: new api.LogGroupLogDestination(logGroup),
        accessLogFormat: api.AccessLogFormat.custom(
          JSON.stringify({
            requestId: "$context.requestId",
            extendedRequestId: "$context.extendedRequestId",
            ip: "$context.identity.sourceIp",
            caller: "$context.identity.caller",
            user: "$context.identity.user",
            requestTime: "$context.requestTime",
            httpMethod: "$context.httpMethod",
            resourcePath: "$context.resourcePath",
            status: "$context.status",
            protocol: "$context.protocol",
            responseLength: "$context.responseLength",
            integrationLatency: "$context.integrationLatency",
            integrationStatus: "$context.integrationStatus",
            responseLatency: "$context.responseLatency",
          }),
        ),
      },
    });
  }
}
