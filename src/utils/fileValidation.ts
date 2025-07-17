import { z } from "zod";

// File validation for uploaded images
export const ImageFileSchema = z.custom<File>((file) => {
  if (!(file instanceof File)) return false;
  
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) return false;
  
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) return false;
  
  // Minimum size check (1KB)
  if (file.size < 1024) return false;
  
  return true;
}, {
  message: "Invalid image file: must be JPEG, PNG, or WebP, between 1KB and 10MB"
});

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  validFiles: File[];
}

export function validateFile(file: File): { isValid: boolean; error?: string } {
  const validation = ImageFileSchema.safeParse(file);
  
  if (!validation.success) {
    return {
      isValid: false,
      error: validation.error.issues[0]?.message || "Invalid file"
    };
  }
  
  return { isValid: true };
}

export function validateFileArray(files: File[]): FileValidationResult {
  const errors: string[] = [];
  const validFiles: File[] = [];
  
  if (!files || files.length === 0) {
    return {
      isValid: false,
      errors: ["At least one image file is required"],
      validFiles: []
    };
  }
  
  // Check maximum number of files (5)
  if (files.length > 5) {
    errors.push("Maximum 5 images allowed");
  }
  
  // Validate each file
  files.forEach((file, index) => {
    const fileValidation = validateFile(file);
    if (!fileValidation.isValid) {
      errors.push(`File ${index + 1}: ${fileValidation.error}`);
    } else {
      validFiles.push(file);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    validFiles
  };
}