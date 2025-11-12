import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const VISION_API_KEY = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!VISION_API_KEY || !GEMINI_API_KEY) {
      throw new Error('Missing API keys in Supabase secrets');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
    const { base64Image, userId, panelName, collectionDate, labProvider, fileName } = await req.json();

    if (!base64Image || !userId) {
      throw new Error('Missing required fields: base64Image and userId');
    }

    console.log('📄 Starting OCR process for user:', userId);

    const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', userId).single();

    if (!existingProfile) {
      console.log('Creating profile for user:', userId);
      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
    }

    console.log('🔍 Calling Vision API...');
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      throw new Error(`Vision API failed: ${visionResponse.status} - ${errorText}`);
    }

    const visionData = await visionResponse.json();
    
    if (visionData.responses[0].error) {
      throw new Error(`Vision API error: ${visionData.responses[0].error.message}`);
    }

    const extractedText = visionData.responses[0].fullTextAnnotation?.text || '';

    if (!extractedText || extractedText.length < 40) {
      throw new Error('Extracted text too short or empty');
    }

    console.log('✅ Vision API extracted', extractedText.length, 'characters');

    console.log('🤖 Calling Gemini API...');
    const prompt = `You are a medical lab report parser. Extract patient info and all biomarker test results.
Return ONLY valid JSON with NO markdown, NO explanations:
{
  "patient": {
    "firstName": "first name only",
    "lastName": "last name only",
    "dateOfBirth": "YYYY-MM-DD format",
    "gender": "male or female or other"
  },
  "biomarkers": [
    {
      "name": "test name",
      "value": numeric_value,
      "unit": "unit",
      "referenceMin": number or null,
      "referenceMax": number or null,
      "category": "CBC or Lipid or Thyroid or Vitamin or Biochemistry",
      "status": "normal or high or low or critical"
    }
  ]
}

Lab Report Text:
${extractedText.substring(0, 15000)}`;

    const models = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let result = null;

    for (const model of models) {
      try {
        console.log(`Trying Gemini model: ${model}...`);
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 8000 }
            })
          }
        );

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          let aiText = geminiData.candidates[0].content.parts[0].text;

          if (aiText.includes('```json')) {
            aiText = aiText.match(/```json\s*([\s\S]*?)\s*```/)?.[1] || aiText;
          } else if (aiText.includes('```')) {
            aiText = aiText.match(/```\s*([\s\S]*?)\s*```/)?.[1] || aiText;
          }

          const match = aiText.match(/\{[\s\S]*\}/);
          if (match) {
            result = JSON.parse(match[0]);
            console.log(`✅ Success with ${model}: Found ${result.biomarkers?.length || 0} biomarkers`);
            break;
          }
        } else {
          const errorText = await geminiResponse.text();
          console.log(`${model} returned ${geminiResponse.status}:`, errorText);
        }
      } catch (e: any) {
        console.log(`${model} failed:`, e.message);
      }
    }

    if (!result || !result.biomarkers || result.biomarkers.length === 0) {
      throw new Error('Gemini could not extract biomarkers from the text');
    }

    console.log('✅ Gemini parsed', result.biomarkers.length, 'biomarkers');

    if (result.patient && Object.keys(result.patient).length > 0) {
      const profileUpdate: any = { updated_at: new Date().toISOString() };
      
      if (result.patient.firstName) profileUpdate.first_name = result.patient.firstName;
      if (result.patient.lastName) profileUpdate.last_name = result.patient.lastName;
      if (result.patient.dateOfBirth) profileUpdate.date_of_birth = result.patient.dateOfBirth;
      if (result.patient.gender) {
        const gender = result.patient.gender.toLowerCase();
        if (['male', 'female', 'other', 'prefer_not_to_say'].includes(gender)) {
          profileUpdate.gender = gender;
        }
      }

      await supabase.from('profiles').update(profileUpdate).eq('id', userId);
      console.log('✅ Profile updated');
    }

    const { data: panelData, error: panelError } = await supabase.from('lab_panels').insert({
      user_id: userId,
      panel_name: panelName || 'Lab Report',
      lab_provider: labProvider || null,
      collection_date: collectionDate || new Date().toISOString().split('T')[0],
      source_type: 'pdf_upload',
      source_file_path: fileName || null,
      processing_status: 'completed',
      processed_at: new Date().toISOString()
    }).select().single();

    if (panelError) {
      throw new Error(`Failed to create lab panel: ${panelError.message}`);
    }

    console.log('✅ Lab panel created:', panelData.id);

    const biomarkerInserts = result.biomarkers.map((b: any) => ({
      lab_panel_id: panelData.id,
      marker_name: b.name,
      marker_category: b.category || 'General',
      value: parseFloat(b.value) || 0,
      unit: b.unit || null,
      reference_range_min: b.referenceMin ? parseFloat(b.referenceMin) : null,
      reference_range_max: b.referenceMax ? parseFloat(b.referenceMax) : null,
      status: b.status || 'normal',
    }));

    const { data: insertedBiomarkers, error: biomarkerError } = await supabase.from('biomarkers').insert(biomarkerInserts).select();

    if (biomarkerError) {
      throw new Error(`Failed to insert biomarkers: ${biomarkerError.message}`);
    }

    console.log('✅ Inserted', insertedBiomarkers.length, 'biomarkers');

    return new Response(JSON.stringify({
      success: true,
      patient: result.patient,
      biomarkers: insertedBiomarkers,
      panelId: panelData.id,
      extractedText: extractedText.substring(0, 500)
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});