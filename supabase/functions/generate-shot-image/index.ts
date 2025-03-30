
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initiateLumaImageGeneration } from "../_shared/luma.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const { shot_id } = await req.json();

    if (!shot_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing shot ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get shot information including the visual prompt
    const { data: shot, error: shotError } = await supabase
      .from("shots")
      .select("id, project_id, visual_prompt, image_status")
      .eq("id", shot_id)
      .single();

    if (shotError || !shot) {
      console.error(`Error fetching shot: ${shotError?.message}`);
      return new Response(
        JSON.stringify({ success: false, error: shotError?.message || "Shot not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if shot already has a visual prompt
    if (!shot.visual_prompt || shot.visual_prompt.trim() === "") {
      return new Response(
        JSON.stringify({ success: false, error: "Shot doesn't have a visual prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Shot ${shot_id}] Starting image generation process.`);

    // Update shot status to generating
    await supabase
      .from("shots")
      .update({ image_status: "generating" })
      .eq("id", shot_id);

    console.log(`[Shot ${shot_id}] Status updated to 'generating'. Visual prompt: ${shot.visual_prompt.substring(0, 60)}...`);

    // Get the user information to associate the generation with
    const { data: authData, error: authError } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.split("Bearer ")[1] || ""
    );

    if (authError || !authData.user) {
      console.error(`Error getting user: ${authError?.message}`);
      return new Response(
        JSON.stringify({ success: false, error: "User not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get project's aspect ratio (default to 16:9 if not found)
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("aspect_ratio")
      .eq("id", shot.project_id)
      .single();

    const aspectRatio = project?.aspect_ratio || "16:9";

    try {
      // Call the helper function to initiate the Luma image generation
      const result = await initiateLumaImageGeneration({
        supabase,
        userId: authData.user.id,
        shotId: shot_id,
        projectId: shot.project_id,
        prompt: shot.visual_prompt,
        aspectRatio
      });

      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error(`[Shot ${shot_id}] Error in generate-shot-image: ${error}`);
      
      // Update shot status to failed
      await supabase
        .from("shots")
        .update({ 
          image_status: "failed",
          failure_reason: error.message
        })
        .eq("id", shot_id);
        
      console.log(`[Shot ${shot_id}] Status updated to 'failed' with reason: ${error.message}`);

      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error(`Unexpected error: ${error.message}`);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
