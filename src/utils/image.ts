import { z } from "zod";

// Base64 image validation schema
export const Base64ImageSchema = z.string().refine((val) => {
  // Check if it's a valid base64 string
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  
  // Remove data URL prefix if present
  const base64Data = val.replace(/^data:image\/[a-z]+;base64,/, '');
  
  // Check if the remaining string is valid base64
  if (!base64Regex.test(base64Data)) {
    return false;
  }
  
  // Check if it's not empty and has reasonable length
  if (base64Data.length < 100 || base64Data.length > 10000000) { // ~7MB max
    return false;
  }
  
  return true;
}, {
  message: "Invalid base64 image format or size"
});

export interface ImageProcessingResult {
  isValid: boolean;
  mimeType?: string;
  size?: number;
  dimensions?: {
    width: number;
    height: number;
  };
  error?: string;
}

export function validateBase64Image(base64String: string): ImageProcessingResult {
  try {
    // Remove data URL prefix if present
    let base64Data = base64String;
    let mimeType = "image/jpeg"; // default
    
    if (base64String.startsWith("data:")) {
      const matches = base64String.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return { isValid: false, error: "Invalid data URL format" };
      }
      mimeType = matches[1];
      base64Data = matches[2];
    }
    
    // Validate base64 format
    const validation = Base64ImageSchema.safeParse(base64Data);
    if (!validation.success) {
      return { isValid: false, error: validation.error.issues[0].message };
    }
    
    // Calculate approximate size
    const size = Math.floor(base64Data.length * 0.75); // base64 to bytes approximation
    
    // Check supported mime types
    const supportedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!supportedTypes.includes(mimeType.toLowerCase())) {
      return { isValid: false, error: "Unsupported image format. Use JPEG, PNG, or WebP" };
    }
    
    return {
      isValid: true,
      mimeType,
      size,
    };
  } catch (error) {
    return { isValid: false, error: "Failed to process image" };
  }
}

export function validateImageArray(images: string[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!Array.isArray(images) || images.length === 0) {
    errors.push("At least one image is required");
    return { isValid: false, errors };
  }
  
  if (images.length > 5) {
    errors.push("Maximum 5 images allowed per request");
  }
  
  images.forEach((image, index) => {
    const result = validateBase64Image(image);
    if (!result.isValid) {
      errors.push(`Image ${index + 1}: ${result.error}`);
    } else if (result.size && result.size > 5 * 1024 * 1024) { // 5MB limit
      errors.push(`Image ${index + 1}: File size too large (max 5MB)`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function extractImageMetadata(base64String: string): {
  hasDataUrl: boolean;
  mimeType: string;
  base64Data: string;
} {
  if (base64String.startsWith("data:")) {
    const matches = base64String.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return {
        hasDataUrl: true,
        mimeType: matches[1],
        base64Data: matches[2]
      };
    }
  }
  
  return {
    hasDataUrl: false,
    mimeType: "image/jpeg", // default assumption
    base64Data: base64String
  };
}