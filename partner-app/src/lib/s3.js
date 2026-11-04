import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const REGION = import.meta.env.VITE_AWS_REGION || 'ap-south-1';
const BUCKET_NAME = import.meta.env.VITE_AWS_S3_BUCKET || 'amaze-plant';

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY || '',
  },
});

export const S3_FOLDERS = {
  QC: 'QC',
  CRITICAL: 'Critical',
  PLANT: 'Plant',
  WARDROBE: 'Wardrobe',
};

/**
 * Check if a garment already has existing photos in the Wardrobe/ folder in S3
 * @param {string} garmentId
 * @param {string} [slot] - Optional slot ('front', 'back', 'other')
 * @returns {Promise<boolean>}
 */
export async function checkWardrobePhotoExists(garmentId, slot = '') {
  if (!garmentId) return false;
  try {
    const cleanId = String(garmentId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = `${S3_FOLDERS.WARDROBE}/${cleanId}${slot ? `_${slot}` : ''}`;
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: 1,
    });
    const res = await s3Client.send(command);
    return Boolean(res.Contents && res.Contents.length > 0);
  } catch (err) {
    console.warn('Could not check wardrobe photos in S3:', err);
    return false;
  }
}

/**
 * Upload a garment QC photo:
 * - Always uploads/updates to QC/ folder with current inspection photo.
 * - Only during FIRST-TIME QC ever for this garment, also saves to Wardrobe/ folder.
 *   If this garment already has wardrobe photos (subsequent orders or rework),
 *   the Wardrobe/ folder is strictly left untouched.
 *
 * @param {File} file - Browser File object
 * @param {Object} options
 * @param {string} options.orderId
 * @param {string} options.garmentId
 * @param {string} options.slot - 'front', 'back', 'other'
 * @param {boolean} [options.isReQC] - If true, re-inspection/rework, never touches Wardrobe/
 * @param {boolean} [options.hasWardrobe] - If true, wardrobe already exists, skip Wardrobe/
 * @returns {Promise<{ qcUrl: string, wardrobeUrl: string | null }>}
 */
export async function uploadGarmentQcPhoto(file, { orderId, garmentId, slot = 'front', isReQC = false, hasWardrobe = false }) {
  if (!file) throw new Error('No file provided for upload');

  const ext = (file.name || 'image.jpg').split('.').pop() || 'jpg';
  const cleanGarmentId = String(garmentId || 'garment').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanOrderId = String(orderId || 'order').replace(/[^a-zA-Z0-9_-]/g, '_');

  // Read binary once from the file
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const contentType = file.type || 'image/jpeg';

  // 1. Upload to QC/ folder (always updated/replaced for this inspection)
  const qcFileName = `${S3_FOLDERS.QC}/${cleanOrderId}_${cleanGarmentId}_${slot}_${Date.now()}.${ext}`;
  const qcCommand = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: qcFileName,
    Body: uint8Array,
    ContentType: contentType,
  });
  await s3Client.send(qcCommand);
  const qcUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${qcFileName}`;

  // 2. Check if we should archive to Wardrobe/ folder (FIRST QC ONLY)
  let wardrobeUrl = null;
  if (!isReQC && !hasWardrobe) {
    // Check if garment already has an initial photo for this slot in Wardrobe/
    const alreadyInWardrobe = await checkWardrobePhotoExists(cleanGarmentId, slot);
    if (!alreadyInWardrobe) {
      // First-time QC: Save permanent digital twin photo in Wardrobe/
      const wardrobeFileName = `${S3_FOLDERS.WARDROBE}/${cleanGarmentId}_${slot}.${ext}`;
      const wardrobeCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: wardrobeFileName,
        Body: uint8Array,
        ContentType: contentType,
      });
      await s3Client.send(wardrobeCommand);
      wardrobeUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${wardrobeFileName}`;
      console.log(`[S3] First-time QC: Saved garment ${garmentId} (${slot}) to Wardrobe/`);
    } else {
      console.log(`[S3] Returning garment: Garment ${garmentId} (${slot}) already has wardrobe photo. Wardrobe/ preserved.`);
    }
  } else {
    console.log(`[S3] Re-QC / subsequent service: QC/ updated. Wardrobe/ preserved.`);
  }

  return { qcUrl, wardrobeUrl };
}

/**
 * General purpose upload to S3 (for Critical defects, etc.)
 * @param {File} file - Browser File object
 * @param {string} folder - Destination folder (e.g. 'QC', 'Critical', 'Plant', 'Wardrobe')
 * @param {string} prefix - Custom filename prefix (e.g. 'ORD-123_garment1_front')
 * @returns {Promise<string>} Public HTTPS S3 URL
 */
export async function uploadToS3(file, folder = S3_FOLDERS.QC, prefix = '') {
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
