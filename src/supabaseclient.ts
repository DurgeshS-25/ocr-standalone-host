// supabase/functions/process-lab-report/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🚀 Edge Function started");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const VISION_KEY = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

    console.log("✅ Environment check:", {
      hasSupabaseUrl: !!SUPABASE_URL,
      hasServiceRole: !!SERVICE_ROLE,
      hasVisionKey: !!VISION_KEY,
      hasGeminiKey: !!GEMINI_KEY
    });

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      throw new Error("Missing Supabase configuration");
    }
    if (!VISION_KEY) {
      throw new Error("Missing Google Vision API key");
    }
    if (!GEMINI_KEY) {
      throw new Error("Missing Gemini API key");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { base64Images, userId, panelName, collectionDate, labProvider, fileName } =
      await req.json();

    console.log("📥 Request received:", {
      userId,
      panelName,
      fileName,
      numPages: Array.isArray(base64Images) ? base64Images.length : 1
    });

    // Handle both single image (old format) and multiple images (new format)
    const imagesToProcess = Array.isArray(base64Images) ? base64Images : [base64Images];

    if (!imagesToProcess.length || !userId) {
      throw new Error("Missing required fields: base64Images or userId");
    }

    // --------------------------------
    // 📌 Upload all files and run OCR on all pages
    // --------------------------------
    console.log(`📤 Processing ${imagesToProcess.length} page(s)...`);
    
    let allExtractedText = "";
    const uploadedPaths: string[] = [];

    for (let i = 0; i < imagesToProcess.length; i++) {
      const base64Image = imagesToProcess[i];
      
      console.log(`📤 Processing page ${i + 1}/${imagesToProcess.length}...`);
      
      const imageBase64 = base64Image.split(",")[1];
      if (!imageBase64) {
        console.error(`⚠️ Invalid base64 format for page ${i + 1}, skipping`);
        continue;
      }

      const binary = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
      const storagePath = `${userId}/${Date.now()}_page${i + 1}_${fileName || "report.png"}`;

      const contentTypeMatch = base64Image.match(/data:(.*?);base64/);
      const contentType = contentTypeMatch ? contentTypeMatch[1] : "image/png";

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from("lab-reports")
        .upload(storagePath, binary, {
          contentType,
          upsert: false
        });

      if (uploadErr) {
        console.error(`❌ Storage upload error for page ${i + 1}:`, uploadErr);
        continue;
      }

      uploadedPaths.push(storagePath);
      console.log(`✅ Page ${i + 1} uploaded: ${storagePath}`);

      // Run Vision OCR on this page
      console.log(`👁️ Running OCR on page ${i + 1}...`);
      
      const visionRes = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [{
              image: { content: imageBase64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
            }]
          })
        }
      );

      if (!visionRes.ok) {
        const errorText = await visionRes.text();
        console.error(`❌ Vision API error for page ${i + 1}:`, errorText);
        continue;
      }

      const visionJson = await visionRes.json();
      const pageText = visionJson?.responses?.[0]?.fullTextAnnotation?.text || "";
      
      console.log(`📄 Page ${i + 1} OCR: ${pageText.length} characters`);
      
      if (pageText) {
        allExtractedText += pageText;
        if (i < imagesToProcess.length - 1) {
          allExtractedText += "\n\n--- PAGE BREAK ---\n\n";
        }
      }
    }

    console.log(`📄 Total OCR text length: ${allExtractedText.length} characters`);

    if (!allExtractedText || allExtractedText.length < 20) {
      throw new Error("Vision OCR returned insufficient text from all pages");
    }

    const extractedText = allExtractedText;

    // Get public URL for first uploaded file
    const storagePath = uploadedPaths[0] || `${userId}/${Date.now()}_${fileName}`;
    const { data: urlData } = supabase.storage
      .from("lab-reports")
      .getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // --------------------------------
    // 🤖 Gemini Parsing with Fallback
    // --------------------------------
    let parsed = { patient: {}, biomarkers: [] };
    let usedFallback = false;

    try {
      console.log("🤖 Starting Gemini AI parsing...");

      const prompt = `Extract ALL structured biomarker data in pure JSON ONLY. Do not include any markdown formatting or explanations.
Return ONLY this JSON structure with no additional text:
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
      "value": 0,
      "unit": "",
      "referenceMin": null,
      "referenceMax": null,
      "status": "normal",
      "category": ""
    }
  ]
}

Extract ALL biomarkers you find. Do not skip any tests.

Lab Report Text:
${extractedText}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,  // ✅ Increased for longer reports
            }
          })
        }
      );

      if (!geminiRes.ok) {
        const errorText = await geminiRes.text();
        console.error("❌ Gemini API error:", errorText);
        throw new Error(`Gemini API failed: ${geminiRes.status} - ${errorText}`);
      }

      const geminiJson = await geminiRes.json();
      console.log("🤖 Gemini response received, parsing...");

      let aiText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      if (!aiText) {
        throw new Error("Gemini returned empty response");
      }

      console.log("🤖 Gemini text length:", aiText.length);

      // Clean up the response
      aiText = aiText.trim();
      aiText = aiText.replace(/```json\s*/g, "");
      aiText = aiText.replace(/```\s*/g, "");
      aiText = aiText.replace(/^[^{]*/, "");
      aiText = aiText.replace(/[^}]*$/, "");

      if (!aiText.startsWith("{")) {
        throw new Error("Gemini response doesn't contain valid JSON");
      }

      parsed = JSON.parse(aiText);

      if (!parsed?.biomarkers || parsed.biomarkers.length === 0) {
        console.warn("⚠️ Gemini returned 0 biomarkers");
        throw new Error("Gemini returned 0 biomarkers");
      }

      console.log("✅ Gemini extracted", parsed.biomarkers.length, "biomarkers");

    } catch (geminiError) {
      console.error("⚠️ Gemini failed:", geminiError.message);
      usedFallback = true;

      console.log("📊 Using fallback pattern matching...");

      const biomarkers = [];
      const lines = extractedText.split("\n");

      // Multiple patterns to catch different formats
      const patterns = [
        // Pattern 1: "Test Name: Value Unit (Min-Max)"
        /([A-Za-z][A-Za-z\s\-()]+?):\s*([\d.]+)\s*([a-zA-Z/%]+)(?:\s*\(?([\d.]+)\s*-\s*([\d.]+)\)?)?/g,
        // Pattern 2: "Test Name   Value   Unit   Min-Max"
        /([A-Za-z][A-Za-z\s\-()]+?)\s{2,}([\d.]+)\s+([a-zA-Z/%]+)\s+([\d.]+)\s*-\s*([\d.]+)/g,
        // Pattern 3: "Test Name Value Unit"
        /([A-Za-z][A-Za-z\s\-()]{3,40})\s+([\d.]+)\s+([a-zA-Z/%]{1,10})\s/g,
      ];

      for (const line of lines) {
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          let match;
          
          while ((match = pattern.exec(line)) !== null) {
            const [_, name, value, unit, min, max] = match;
            
            if (name && value && unit && name.length > 2 && name.length < 50) {
              const numValue = parseFloat(value);
              const refMin = min ? parseFloat(min) : null;
              const refMax = max ? parseFloat(max) : null;

              let status = "normal";
              if (refMin !== null && refMax !== null) {
                if (numValue < refMin) status = "low";
                else if (numValue > refMax) status = "high";
              }

              biomarkers.push({
                name: name.trim(),
                value: numValue,
                unit: unit.trim(),
                referenceMin: refMin,
                referenceMax: refMax,
                status,
                category: "General"
              });
            }
          }
        }
      }

      // Remove duplicates based on marker name
      const uniqueBiomarkers = Array.from(
        new Map(biomarkers.map(b => [b.name, b])).values()
      );

      if (uniqueBiomarkers.length === 0) {
        throw new Error("Both Gemini and fallback failed to extract biomarkers");
      }

      parsed = {
        patient: {},
        biomarkers: uniqueBiomarkers
      };

      console.log("✅ Fallback extracted", uniqueBiomarkers.length, "biomarkers");
    }

    // --------------------------------
    // 📌 Insert lab panel into DB
    // --------------------------------
    console.log("💾 Inserting lab panel...");

    const { data: panel, error: panelErr } = await supabase
      .from("lab_panels")
      .insert({
        user_id: userId,
        panel_name: panelName || "Lab Report",
        lab_provider: labProvider || null,
        collection_date: collectionDate || new Date().toISOString().split("T")[0],
        source_type: "ocr_processed",
        processing_status: "completed",
        processed_at: new Date().toISOString(),
        source_file_path: storagePath
      })
      .select()
      .single();

    if (panelErr) {
      console.error("❌ Database panel error:", panelErr);
      throw new Error(`Failed to insert lab panel: ${panelErr.message}`);
    }

    console.log("✅ Lab panel created:", panel.id);

    // --------------------------------
    // 📌 Insert biomarkers
    // --------------------------------
    console.log("💾 Inserting biomarkers...");

    const biomarkerRows = parsed.biomarkers.map((b) => ({
      lab_panel_id: panel.id,
      marker_name: b.name,
      marker_category: b.category || "General",
      value: Number(b.value),
      unit: b.unit || null,
      reference_range_min: b.referenceMin,
      reference_range_max: b.referenceMax,
      status: b.status || "normal"
    }));

    const { data: biomarkers, error: bioErr } = await supabase
      .from("biomarkers")
      .insert(biomarkerRows)
      .select();

    if (bioErr) {
      console.error("❌ Database biomarker error:", bioErr);
      throw new Error(`Failed to insert biomarkers: ${bioErr.message}`);
    }

    console.log("✅ Inserted", biomarkers.length, "biomarkers");

    // --------------------------------
    // Final Response
    // --------------------------------
    return new Response(
      JSON.stringify({
        success: true,
        panelId: panel.id,
        biomarkers,
        patient: parsed.patient,
        rawTextPreview: extractedText.slice(0, 500),
        fileUrl,
        usedFallback,
        extractionMethod: usedFallback ? "pattern-matching" : "gemini-ai",
        pagesProcessed: uploadedPaths.length,
        totalTextLength: extractedText.length
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (err) {
    console.error("❌ FATAL ERROR:", err.message);
    console.error("Stack:", err.stack);

    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
        stack: err.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});