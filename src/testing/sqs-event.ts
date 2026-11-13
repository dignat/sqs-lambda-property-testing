import type { SQSEvent, SQSRecord } from "aws-lambda";

/** Builds a minimal but type-correct SQS record. Only body/messageId matter. */
export function sqsRecord(messageId: string, body: string): SQSRecord {
  return {
    messageId,
    receiptHandle: `receipt-${messageId}`,
    body,
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: "0",
      SenderId: "test",
      ApproximateFirstReceiveTimestamp: "0",
    },
    messageAttributes: {},
    md5OfBody: "",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:us-east-1:000000000000:orders",
    awsRegion: "us-east-1",
  };
}

export function sqsEvent(
  messages: ReadonlyArray<{ messageId: string; body: string }>,
): SQSEvent {
  return {
    Records: messages.map((m) => sqsRecord(m.messageId, m.body)),
  };
}
