import multer from "multer";

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

// Files now go to S3 (see s3StorageService.js) instead of local disk, so
// multer just buffers them in memory — the controller uploads req.file(s)
// .buffer itself and picks the filename.
export const uploadPanImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      return callback(new Error("Only JPG, PNG, and WEBP images can be uploaded for PAN."));
    }
    return callback(null, true);
  },
}).single("panImage");

export const uploadSignatureImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      return callback(new Error("Only JPG, PNG, and WEBP images can be uploaded for the signature."));
    }
    return callback(null, true);
  },
}).single("signatureImage");

const acceptedIpvMimeTypes = new Set(["video/webm", "video/mp4", "image/jpeg"]);

export const uploadIpvCapture = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!acceptedIpvMimeTypes.has(file.mimetype)) {
      return callback(new Error("Only WEBM/MP4 video or a JPEG still can be uploaded for IPV."));
    }
    return callback(null, true);
  },
}).fields([
  { name: "ipvCapture", maxCount: 1 }, // the 5-second liveness video
  { name: "ipvPhoto", maxCount: 1 }, // a still frame pulled from that video, used later in the PDF
]);
