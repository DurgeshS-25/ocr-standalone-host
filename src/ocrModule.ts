// src/ocrModule.ts
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Convert all pages of PDF to Base64 images with high quality
 */
export const pdfToBase64Images = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  const images: string[] = [];
  
  // Process all pages (limit to 5 pages to avoid huge uploads)
  const numPages = Math.min(pdf.numPages, 5);
  
  console.log(`📄 PDF has ${pdf.numPages} pages, processing first ${numPages}`);
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    
    // Higher scale = better OCR quality
    const viewport = page.getViewport({ scale: 4.0 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
    
    const base64 = canvas.toDataURL("image/png");
    images.push(base64);
    
    console.log(`✅ Converted page ${i}/${numPages} (${(base64.length / 1024 / 1024).toFixed(2)} MB)`);
  }
  
  return images;
};

/**
 * Legacy function for single page (kept for backwards compatibility)
 */
export const pdfToBase64Image = async (file: File): Promise<string> => {
  const images = await pdfToBase64Images(file);
  return images[0]; // Return first page only
};

/**
 * Process lab report with Edge Function - supports multiple pages
 */
export const processLabReportWithEdgeFunction = async (
  file: File,
  userId: string,
  panelName: string,
  collectionDate: string,
  labProvider: string
) => {
  try {
    console.log("📄 Converting PDF to Base64 images...");
    const base64Images = await pdfToBase64Images(file);
    
    console.log(`✅ Converted ${base64Images.length} page(s)`);

    const payload = {
      base64Images, // Send array of images
      userId,
      panelName: panelName || "Lab Report",
      collectionDate: collectionDate || new Date().toISOString().split("T")[0],
      labProvider: labProvider || "Unknown",
      fileName: file?.name || "lab_report.pdf",
    };

    console.log("🚀 Calling Edge Function with payload:", {
      userId: payload.userId,
      panelName: payload.panelName,
      fileName: payload.fileName,
      numPages: base64Images.length,
      totalSize: `${(base64Images.reduce((sum, img) => sum + img.length, 0) / 1024 / 1024).toFixed(2)} MB`
    });

    const { data, error } = await supabase.functions.invoke(
      "process-lab-report",
      {
        body: payload,
      }
    );

    console.log("📥 Edge Function raw response:", { data, error });

    if (error) {
      console.error("❌ Edge Function error object:", JSON.stringify(error, null, 2));
      throw new Error(`Edge Function error: ${error.message || JSON.stringify(error)}`);
    }

    if (!data) {
      throw new Error("Edge Function returned empty response");
    }

    if (!data.success) {
      console.error("❌ Edge Function returned success=false:", data);
      throw new Error(data.error || "Unknown error from Edge Function");
    }

    console.log("✅ Edge Function success:", {
      panelId: data.panelId,
      biomarkerCount: data.biomarkers?.length,
      usedFallback: data.usedFallback
    });

    return data;
    
  } catch (err: any) {
    console.error("💥 processLabReportWithEdgeFunction ERROR:", {
      message: err.message,
      stack: err.stack,
      fullError: err
    });
    throw err;
  }
};