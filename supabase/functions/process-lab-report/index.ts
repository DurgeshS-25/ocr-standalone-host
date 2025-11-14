// supabase/functions/process-lab-report/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VISION_KEY = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY")!;
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const {
      base64Image,
      userId,
      panelName,
      collectionDate,
      labProvider,
      fileName,
    } = await req.json();

    if (!base64Image || !userId) {
      throw new Error("Missing required fields: base64Image or userId");
    }

    // --------------------------------
    // 📌 Upload file to Storage
    // --------------------------------
    const imageBase64 = base64Image.split(",")[1]; // Remove prefix
    const binary = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    const storagePath = `${userId}/${Date.now()}_${fileName}`;
    const { error: uploadErr } = await supabase.storage
      .from("lab-reports")
      .upload(storagePath, binary, {
        contentType: "image/png",
      });

    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage
      .from("lab-reports")
      .getPublicUrl(storagePath);

    const fileUrl = urlData.publicUrl;

    // --------------------------------
    // 📌 Vision API OCR
    // --------------------------------
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
      }
    );

    const visionJson = await visionRes.json();
    const extractedText =
      visionJson?.responses?.[0]?.fullTextAnnotation?.text || "";

    if (!extractedText || extractedText.length < 20) {
      throw new Error("Vision OCR returned insufficient text");
    }

    // --------------------------------
    // 🤖 Gemini Parsing
    // --------------------------------
    const prompt = `
Extract structured biomarker data in pure JSON ONLY.
Return format:
{
  "patient": {
    "firstName": "",
    "lastName": "",
    "dateOfBirth": "",
    "gender": ""
  },
  "biomarkers": [
    {
      "name": "",
      "value": number,
      "unit": "",
      "referenceMin": number | null,
      "referenceMax": number | null,
      "status": "normal" | "high" | "low" | "critical",
      "category": ""
    }
  ]
}

Lab Report Text:
${extractedText}
    `.trim();

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    const geminiJson = await geminiRes.json();
    let aiText =
      geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    aiText = aiText.replace(/```json|```/g, ""); // Remove markdown

    const firstJson = aiText.match(/\{[\s\S]*\}/);
    if (!firstJson) throw new Error("Gemini returned no valid JSON");

    const parsed = JSON.parse(firstJson[0]);

    if (!parsed?.biomarkers?.length) {
      throw new Error("Gemini did not extract biomarkers");
    }

    // --------------------------------
    // 📌 Insert lab panel into DB
    // --------------------------------
    const { data: panel, error: panelErr } = await supabase
      .from("lab_panels")
      .insert({
        user_id: userId,
        panel_name: panelName,
        lab_provider: labProvider,
        collection_date: collectionDate,
        source_type: "image",
        processed_at: new Date().toISOString(),
        source_file_path: storagePath,
      })
      .select()
      .single();

    if (panelErr) throw panelErr;

    // --------------------------------
    // 📌 Insert biomarkers
    // --------------------------------
    const biomarkerRows = parsed.biomarkers.map((b: any) => ({
      lab_panel_id: panel.id,
      marker_name: b.name,
      marker_category: b.category || "General",
      value: Number(b.value),
      unit: b.unit,
      reference_range_min: b.referenceMin,
      reference_range_max: b.referenceMax,
      status: b.status || "normal",
    }));

    const { data: biomarkers, error: bioErr } = await supabase
      .from("biomarkers")
      .insert(biomarkerRows)
      .select();

    if (bioErr) throw bioErr;

    // --------------------------------
    // Final Response
    // --------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        panelId: panel.id,
        biomarkers,
        patient: parsed.patient,
        rawTextPreview: extractedText.slice(0, 200),
        fileUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ ERROR:", err.message);

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
