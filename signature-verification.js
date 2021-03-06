const { createHmac } = require("crypto");

const isValidPostRequest = (secret, request) => {
  // Verify the timestamp
  const sentAtSeconds = request.header("X-Canva-Timestamp");
  const receivedAtSeconds = new Date().getTime() / 1000;

  if (!isValidTimestamp(sentAtSeconds, receivedAtSeconds)) {
    return false;
  }

  // Construct the message
  const version = "v1";
  const timestamp = request.header("X-Canva-Timestamp");
  const path = request.path;
  const body = request.rawBody;
  const message = `${version}:${timestamp}:${path}:${body}`;

  // Calculate a signature
  const signature = calculateSignature(secret, message);

  // Reject requests with invalid signatures
  if (!request.header("X-Canva-Signatures").includes(signature)) {
    return false;
  }

  return true;
};

const isValidGetRequest = (secret, request) => {
  // Verify the timestamp
  const sentAtSeconds = request.query.time;
  const receivedAtSeconds = new Date().getTime() / 1000;

  if (!isValidTimestamp(sentAtSeconds, receivedAtSeconds)) {
    return false;
  }

  // Construct the message
  const version = "v1";
  const { time, user, brand, extensions, state } = request.query;
  const message = `${version}:${time}:${user}:${brand}:${extensions}:${state}`;

  // Calculate a signature
  const signature = calculateSignature(secret, message);

  // Reject requests with invalid signatures
  if (!request.query.signatures.includes(signature)) {
    return false;
  }

  return true;
};

const isValidTimestamp = (
  sentAtSeconds,
  receivedAtSeconds,
  leniencyInSeconds = 300
) => {
  return (
    Math.abs(Number(sentAtSeconds) - Number(receivedAtSeconds)) <
    Number(leniencyInSeconds)
  );
};

const calculateSignature = (secret, message) => {
  // Decode the client secret
  const string = secret.replace("-", "+").replace("_", "/");
  const key = Buffer.from(string, "base64");

  // Calculate the signature
  return createHmac("sha256", key).update(message).digest("hex");
};

module.exports = { isValidPostRequest, isValidGetRequest };
