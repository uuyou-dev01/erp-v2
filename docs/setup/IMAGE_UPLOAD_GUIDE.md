# Image Upload Configuration Guide

## Current Implementation

Currently, images are stored locally in the `public/uploads` directory. This is suitable for development but not recommended for production.

## Migration to Cloud Storage

For production deployment, you should migrate to a cloud storage service. Here are the recommended options:

### Option 1: AWS S3

1. Install AWS SDK:
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

2. Update `app/api/upload/route.ts`:
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// In the POST handler:
const key = `sku-images/${timestamp}-${randomStr}.${ext}`;
await s3Client.send(
  new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: file.type,
  })
);

const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
```

3. Add environment variables to `.env`:
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=your-bucket-name
```

### Option 2: Cloudinary

1. Install Cloudinary SDK:
```bash
npm install cloudinary
```

2. Update `app/api/upload/route.ts`:
```typescript
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// In the POST handler:
const base64Image = `data:${file.type};base64,${buffer.toString("base64")}`;
const result = await cloudinary.uploader.upload(base64Image, {
  folder: "sku-images",
  resource_type: "image",
});

const url = result.secure_url;
```

3. Add environment variables to `.env`:
```
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Option 3: Vercel Blob Storage

1. Install Vercel Blob:
```bash
npm install @vercel/blob
```

2. Update `app/api/upload/route.ts`:
```typescript
import { put } from "@vercel/blob";

// In the POST handler:
const blob = await put(`sku-images/${filename}`, buffer, {
  access: "public",
  contentType: file.type,
});

const url = blob.url;
```

3. Add environment variable to `.env`:
```
BLOB_READ_WRITE_TOKEN=your_token
```

## Database Schema

The current schema stores image URLs as strings:

```prisma
model SKU {
  // ...
  imageUrl    String?
  // ...
}
```

This works for both local file paths (`/uploads/...`) and cloud URLs (`https://...`).

## Migration Steps

1. Choose a cloud storage provider
2. Install the required SDK
3. Update `app/api/upload/route.ts` with the new implementation
4. Add environment variables
5. Test the upload functionality
6. (Optional) Migrate existing images from local storage to cloud storage

## Notes

- The current implementation has a 5MB file size limit
- Supported formats: JPEG, PNG, GIF, WebP
- Images are validated on both client and server side
- Consider adding image optimization/resizing for better performance
