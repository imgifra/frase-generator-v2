require("dotenv").config();

const path = require("path");
const { v2: cloudinary } = require("cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function buildPublicId(fileName) {
  const baseName = path.parse(fileName).name;
  return `mono_generator/${baseName}`;
}

async function uploadImage(localPath, fileName) {
  const publicId = buildPublicId(fileName);

  const result = await cloudinary.uploader.upload(localPath, {
    public_id: publicId,
    overwrite: true,
    resource_type: "image"
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format
  };
}

async function deleteImage(publicId) {
  if (!publicId) {
    return {
      result: "skipped",
      reason: "missing_public_id"
    };
  }

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "image"
  });

  return result;
}

module.exports = {
  uploadImage,
  deleteImage
};