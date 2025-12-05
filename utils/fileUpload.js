const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const AppError = require('./AppError');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure memory storage (we'll handle Cloudinary upload manually)
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  // Accept files
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|csv/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(file.originalname.toLowerCase());

  if (mimetype && extname) {
    return cb(null, true);
  }
  
  cb(new AppError('Invalid file type. Only images, PDFs, and documents are allowed.', 400));
};

// Multer upload configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

/**
 * Upload single file to Cloudinary
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} filename - Original filename
 * @returns {Promise<Object>} - Upload result with URL
 */
async function uploadFile(fileBuffer, filename) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'airtable-forms',
        resource_type: 'auto',
        public_id: `${Date.now()}-${filename}`
      },
      (error, result) => {
        if (error) {
          reject(new AppError('File upload failed', 500));
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            size: result.bytes,
            filename: filename
          });
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
}

/**
 * Delete file from Cloudinary
 * @param {String} publicId - Cloudinary public ID
 * @returns {Promise<Object>} - Delete result
 */
async function deleteFile(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    throw new AppError('Failed to delete file', 500);
  }
}

/**
 * Format uploaded files for Airtable attachment field
 * @param {Array} files - Array of Multer file objects
 * @returns {Array} - Array of attachment objects with URLs
 */
function formatFilesForAirtable(files) {
  if (!files || files.length === 0) return [];
  
  return files.map(file => ({
    url: file.path || file.secure_url,
    filename: file.originalname
  }));
}

module.exports = {
  upload,
  uploadFile,
  deleteFile,
  formatFilesForAirtable,
  cloudinary
};
