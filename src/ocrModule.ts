import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";
import { supabase } from "./supabaseClient";

const pdfToBase64Image = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error("Could not get canvas context");
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/png').split(',')[1];
};

export const processLabReportWithEdgeFunction = async (
  file: File,
  userId: string,
  panelName: string,
  collectionDate: string,
  labProvider: string
) => {
  try {
    console.log("=== START OCR PROCESSING ===");
    console.log("📄 Converting PDF to base64...");
    const base64Image = await pdfToBase64Image(file);
    console.log("✅ Base64 length:", base64Image.length);
    
    console.log("☁️ Calling Edge Function...");
    const { data, error } = await supabase.functions.invoke('process-lab-report', {
      body: { 
        base64Image, 
        userId, 
        panelName, 
        collectionDate, 
        labProvider, 
        fileName: file.name 
      }
    });
    
    console.log("📦 Edge Function Response:", data);
    console.log("❌ Edge Function Error:", error);
    
    if (error) {
      console.error("❌ Edge Function error details:", error);
      throw error;
    }
    
    if (!data || !data.success) {
      console.error("❌ Processing failed:", data);
      throw new Error(data?.error || 'Processing failed');
    }
    
    console.log("📝 Extracted Text (first 500 chars):", data.extractedText);
    console.log("👤 Patient Info:", data.patient);
    console.log("🧪 Biomarkers:", data.biomarkers);
    console.log("=== END OCR PROCESSING ===");
    
    return data;
  } catch (error) {
    console.error("💥 Process failed:", error);
    throw error;
  }
};
