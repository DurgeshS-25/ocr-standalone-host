import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";
import { createClient } from "@supabase/supabase-js";

// Inline Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    console.log("📄 Converting PDF to base64...");
    const base64Image = await pdfToBase64Image(file);
    
    console.log("☁️ Calling Edge Function...");
    const { data, error } = await supabase.functions.invoke('process-lab-report', {
      body: { base64Image, userId, panelName, collectionDate, labProvider, fileName: file.name }
    });
    
    if (error) throw error;
    if (!data || !data.success) throw new Error(data?.error || 'Processing failed');
    
    console.log("✅ Success:", data);
    return data;
  } catch (error) {
    console.error("💥 Error:", error);
    throw error;
  }
};