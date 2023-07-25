import { DeleteObjectsCommand, DeleteObjectsCommandInput, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export function buildBucketName(name: string) {
  // https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
  return name.toLowerCase().substring(0, 63).replace(/[^a-z0-9]$/, 'a');
}

export function decodeS3URI(uri: string): string {
  const withSpaces = uri.replace(/\+/g, ' ');
  return decodeURIComponent(withSpaces);
}

export async function emptyS3Directory(client: S3Client, bucket: string, dir: string): Promise<void> {
  const { Contents = [], IsTruncated } = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: dir
    })
  );

  if (Contents.length === 0) return;

  const deleteParams: DeleteObjectsCommandInput = {
    Bucket: bucket,
    Delete: { Objects: [] }
  };

  for (const { Key } of Contents)
    deleteParams.Delete!.Objects!.push({ Key });

  await client.send(
    new DeleteObjectsCommand(deleteParams)
  );

  if (IsTruncated) await emptyS3Directory(client, bucket, dir);
}