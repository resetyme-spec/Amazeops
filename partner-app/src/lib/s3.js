import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const REGION = import.meta.env.VITE_AWS_REGION || 'ap-south-1';
const BUCKET_NAME = import.meta.env.VITE_AWS_S3_BUCKET || 'qc-bucket-597581086829-ap-south-1-an';

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Upload a File object to AWS S3 and return the permanent public URL
 * @param {File} file - Browser File object
 * @param {string} folder - Destination folder (e.g. 'qc-photos', 'defect-photos')
 * @param {string} prefix - Custom filename prefix (e.g. 'ORD-123_garment1_front')
 * @returns {Promise<string>} Public HTTPS S3 URL
 */
export async function uploadToS3(file, folder = 'qc-photos', prefix = '') {
  if (!file) throw new Error('No file provided for upload');

  const ext = (file.name || 'image.jpg').split('.').pop() || 'jpg';
  const cleanPrefix = prefix ? prefix.replace(/[^a-zA-Z0-9_-]/g, '_') : 'photo';
  const fileName = `${folder}/${cleanPrefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;

  // Read file as ArrayBuffer for clean binary S3 upload in the browser
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: uint8Array,
    ContentType: file.type || 'image/jpeg',
  });

  await s3Client.send(command);

  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileName}`;
}
