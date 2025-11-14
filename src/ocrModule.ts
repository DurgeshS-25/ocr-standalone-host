// src/ocrModule.ts

import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Convert PDF → PNG → Base64 (FULL DATA URL string)
 */
export const pdfToBase64Image = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2.5 });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Return FULL data URI, not trimmed base64
  return canvas.toDataURL("image/png");
};

/**
 * Call Supabase Edge Function — process-lab-report
 */
export const processLabReportWithEdgeFunction = async (
  file: File,
  userId: string,
  panelName: string,
  collectionDate: string,
  labProvider: string
) => {
  try {
    console.log("📄 Converting PDF to Base64...");
    const base64Image = await pdfToBase64Image(file);

    const payload = {
      base64Image,
      userId,
      panelName: panelName || "Lab Report",
      collectionDate: collectionDate || new Date().toISOString().split("T")[0],
      labProvider: labProvider || "Unknown",
      fileName: file?.name || "lab_report.pdf",
    };

    console.log("🚀 Sending payload to Edge Function:", {
      ...payload,
      base64Preview: base64Image.slice(0, 40) + "...",
    });

    const { data, error } = await supabase.functions.invoke(
      "process-lab-report",
      {
        body: payload,
      }
    );

    if (error) {
      console.error("❌ Edge Function ERROR:", error);
      throw new Error(error.message || "Edge Function failed");
    }

    if (!data?.success) {
      throw new Error(data?.error || "Unknown error from Edge Function");
    }

    return data;
  } catch (err: any) {
    console.error("💥 processLabReportWithEdgeFunction ERROR:", err);
    throw err;
  }
};
