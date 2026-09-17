import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { uploadsS3Proxy } from "./middleware/uploadsS3Proxy.js";
import healthRoutes from "./routes/healthRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import panRoutes from "./routes/panRoutes.js";
import digilockerRoutes from "./routes/digilockerRoutes.js";
import bankRoutes from "./routes/bankRoutes.js";
import personalRoutes from "./routes/personalRoutes.js";
import nomineeRoutes from "./routes/nomineeRoutes.js";
import otpRoutes from "./routes/otpRoutes.js";
import ipvRoutes from "./routes/ipvRoutes.js";
import clientLinkRoutes from "./routes/clientLinkRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import esignRoutes from "./routes/esignRoutes.js";
import cvlkraExportRoutes from "./routes/cvlkraExportRoutes.js";
import cdslExportRoutes from "./routes/cdslExportRoutes.js";
import nseExportRoutes from "./routes/nseExportRoutes.js";
import bseExportRoutes from "./routes/bseExportRoutes.js";
import mfExportRoutes from "./routes/mfExportRoutes.js";
import techexcelExportRoutes from "./routes/techexcelExportRoutes.js";

const app = express();

app.use(cors());
// Capture the raw body alongside the parsed one — the Razorpay webhook has
// to verify its HMAC signature against the exact bytes Razorpay sent.
app.use(
  express.json({
    verify: (request, _response, buffer) => {
      request.rawBody = buffer;
    },
  }),
);
app.use("/uploads", uploadsS3Proxy, express.static(path.resolve("uploads")));

app.use("/api", healthRoutes);
app.use("/api/kyc", leadRoutes);
app.use("/api/kyc", panRoutes);
app.use("/api/kyc", digilockerRoutes);
app.use("/api/kyc", bankRoutes);
app.use("/api/kyc", personalRoutes);
app.use("/api/kyc", nomineeRoutes);
app.use("/api/kyc", otpRoutes);
app.use("/api/kyc", ipvRoutes);
app.use("/api/kyc", clientLinkRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api", esignRoutes);
app.use("/api", cvlkraExportRoutes);
app.use("/api", cdslExportRoutes);
app.use("/api", nseExportRoutes);
app.use("/api", bseExportRoutes);
app.use("/api", mfExportRoutes);
app.use("/api", techexcelExportRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
