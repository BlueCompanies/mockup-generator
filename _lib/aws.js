import { S3Client } from "@aws-sdk/client-s3";

export default function awsS3() {
  const ACCESS_KEY_ID = process.env.NEXT_PUBLIC_ACCESS_KEY_ID;
  const ACCESS_KEY_SECRET = process.env.NEXT_PUBLIC_ACCESS_KEY_SECRET;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://5ae9017fbb2c986a55c6b39962fcde89.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: `${ACCESS_KEY_ID}`,
      secretAccessKey: `${ACCESS_KEY_SECRET}`,
    },
  });
  return s3;
}
