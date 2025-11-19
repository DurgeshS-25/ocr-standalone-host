// supabase/functions/get-user-data/index.ts
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
    console.log("🚀 Get User Data started");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { userId } = await req.json();

    if (!userId) {
      throw new Error("Missing userId");
    }

    console.log(`📥 Fetching data for user: ${userId}`);

    // Fetch pilot user data
    const { data: userData, error: userError } = await supabase
      .from("pilot_user_data")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError) {
      throw new Error(`User not found: ${userError.message}`);
    }

    console.log(`✅ User: ${userData.first_name} ${userData.last_name}`);

    // Fetch all data in parallel
    const [
      labPanelsResult,
      biomarkersResult,
      structuredLabsResult,
      genomicResult,
      wearableResult,
      medicationsResult,
      metabolomicsResult,
      microbiomeResult,
      surveysResult
    ] = await Promise.all([
      supabase
        .from("lab_panels")
        .select("*")
        .eq("user_id", userId)
        .order("collection_date", { ascending: false }),
      
      supabase
        .from("biomarkers")
        .select(`*, lab_panels!inner(user_id)`)
        .eq("lab_panels.user_id", userId)
        .order("created_at", { ascending: false }),
      
      supabase
        .from("structured_lab_results")
        .select("*")
        .eq("user_id", userId)
        .order("collected_at", { ascending: false }),
      
      supabase
        .from("genomic_summary")
        .select("*")
        .eq("user_id", userId)
        .order("processed_at", { ascending: false }),
      
      supabase
        .from("wearable_daily_aggregates")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(90),
      
      supabase
        .from("medication_supplement_history")
        .select("*")
        .eq("user_id", userId)
        .order("start_date", { ascending: false }),
      
      supabase
        .from("metabolomics_summary")
        .select("*")
        .eq("user_id", userId)
        .order("collected_at", { ascending: false }),
      
      supabase
        .from("microbiome_summary")
        .select("*")
        .eq("user_id", userId)
        .order("collected_at", { ascending: false }),
      
      supabase
        .from("surveys_adherence_logs")
        .select("*")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .limit(100)
    ]);

    console.log("✅ All data fetched");

    const response = {
      success: true,
      userId,
      userData: {
        profile: userData,
        labPanels: labPanelsResult.data || [],
        biomarkers: biomarkersResult.data || [],
        structuredLabResults: structuredLabsResult.data || [],
        genomicSummary: genomicResult.data || [],
        wearableData: wearableResult.data || [],
        medications: medicationsResult.data || [],
        metabolomics: metabolomicsResult.data || [],
        microbiome: microbiomeResult.data || [],
        surveys: surveysResult.data || []
      },
      summary: {
        totalLabPanels: labPanelsResult.data?.length || 0,
        totalBiomarkers: biomarkersResult.data?.length || 0,
        totalStructuredLabs: structuredLabsResult.data?.length || 0,
        totalGenomicRecords: genomicResult.data?.length || 0,
        totalWearableDays: wearableResult.data?.length || 0,
        totalMedications: medicationsResult.data?.length || 0,
        totalMetabolomics: metabolomicsResult.data?.length || 0,
        totalMicrobiome: microbiomeResult.data?.length || 0,
        totalSurveys: surveysResult.data?.length || 0
      },
      retrievedAt: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ ERROR:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});