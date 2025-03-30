
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callClaudeApi } from '../_shared/claude.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';

interface RequestBody {
    shot_id: string;
}

interface ShotData {
    prompt_idea: string | null;
    shot_type: string | null;
    dialogue: string | null;
    sound_effects: string | null;
    scene: { 
        description: string | null;
        location: string | null;
        lighting: string | null;
        weather: string | null;
        project: {
            genre: string | null;
            tone: string | null;
            video_style: string | null;
            cinematic_inspiration: string | null;
        }
    }
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return handleCors();
    }

    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
        // Get the shot ID from the request
        const { shot_id }: RequestBody = await req.json();
        if (!shot_id) {
            return errorResponse('shot_id is required', 400);
        }

        console.log(`Generating visual prompt for shot ID: ${shot_id}`);

        // 1. Fetch Shot and Context Data
        const { data: shotData, error: fetchError } = await supabaseClient
            .from('shots')
            .select(`
                prompt_idea,
                shot_type,
                dialogue,
                sound_effects,
                scene:scenes (
                    description,
                    location,
                    lighting,
                    weather,
                    project:projects (
                        genre,
                        tone,
                        video_style,
                        cinematic_inspiration
                    )
                )
            `)
            .eq('id', shot_id)
            .single();

        if (fetchError || !shotData) {
            console.error('Error fetching shot data:', fetchError?.message);
            return errorResponse('Shot not found or failed to fetch context', 404);
        }

        // 2. Prepare Prompt for Claude
        const systemPrompt = `You are an expert visual director translating script details into concise, powerful image generation prompts for an AI model like Luma Dream Machine (Photon Flash or SDXL compatible).
Focus ONLY on visual elements derived from the provided shot details and context.
Output *only* a comma-separated list of descriptive keywords and phrases suitable for image generation.
Prioritize:
- Shot Type (e.g., 'wide shot', 'medium close-up', 'over the shoulder').
- Subject(s) & Action (if any implied in prompt_idea or dialogue).
- Key Environment/Location elements (from scene location/description).
- Lighting & Mood (from scene lighting/tone/weather).
- Visual Style (from project style/inspiration, e.g., 'cinematic lighting', 'film noir shadows', 'anime style', 'photorealistic', 'Unreal Engine render').
- Use concrete visual descriptors. Avoid abstract concepts or sounds unless they strongly imply visuals (e.g., 'shattering glass' implies shards).
- Keep it focused and avoid excessive detail unless crucial. Max length around 150 words.
- DO NOT invent characters or actions not suggested by the input.
- DO NOT include dialogue or sound effects directly unless they describe a visual (e.g., 'character shouting' implies open mouth).
- Structure: Start with shot type, main subject/action, then environment/style keywords.
Example output: medium shot, woman looking out rainy window, melancholic mood, cinematic lighting, bokeh background, detailed reflection
Output *only* the comma-separated prompt string. No extra text or formatting.`;

        const userPrompt = `Generate an image prompt based on these details:
        --- Shot Details ---
        Shot Type: ${shotData.shot_type || 'Not specified'}
        Idea/Description: ${shotData.prompt_idea || 'No specific idea provided.'}
        Dialogue context (if relevant for expression/action): ${shotData.dialogue || 'None'}
        Sound context (if relevant for visuals): ${shotData.sound_effects || 'None'}
        --- Scene Context ---
        Scene Description: ${shotData.scene?.description || 'None'}
        Location: ${shotData.scene?.location || 'None'}
        Lighting: ${shotData.scene?.lighting || 'None'}
        Weather: ${shotData.scene?.weather || 'None'}
        --- Project Context ---
        Genre: ${shotData.scene?.project?.genre || 'None'}
        Tone: ${shotData.scene?.project?.tone || 'None'}
        Video Style: ${shotData.scene?.project?.video_style || 'None'}
        Cinematic Inspiration: ${shotData.scene?.project?.cinematic_inspiration || 'None'}
        ---
        Generate the visual prompt string:`;

        // 3. Call Claude API
        const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
        if (!claudeApiKey) {
            return errorResponse('Server config error: Anthropic key missing', 500);
        }

        const visualPrompt = await callClaudeApi(claudeApiKey, systemPrompt, userPrompt, 300); // Max 300 tokens
        const cleanedVisualPrompt = visualPrompt.trim().replace(/^"|"$/g, ''); // Remove potential wrapping quotes

        console.log(`Generated Visual Prompt for shot ${shot_id}: ${cleanedVisualPrompt}`);

        // 4. Update Shot Record in Database
        const { error: updateError } = await supabaseClient
            .from('shots')
            .update({ 
                visual_prompt: cleanedVisualPrompt,
                image_status: 'prompt_ready' // Update status to indicate prompt is ready
            })
            .eq('id', shot_id);

        if (updateError) {
            console.error(`Failed to update shot ${shot_id} with visual prompt:`, updateError);
            return errorResponse('Failed to save generated prompt', 500);
        }

        console.log(`Successfully updated shot ${shot_id} with visual prompt.`);
        
        // 5. Trigger image generation asynchronously
        console.log(`Triggering image generation for shot ${shot_id}`);
        
        try {
            const { error: invokeError } = await supabaseClient.functions.invoke(
                'generate-shot-image',
                { body: { shot_id: shot_id } }
            );
            
            if (invokeError) {
                console.error(`Failed to invoke image generation for shot ${shot_id}:`, invokeError);
                // Continue anyway as the prompt generation succeeded
            } else {
                console.log(`Successfully invoked image generation for shot ${shot_id}`);
            }
        } catch (invokeError) {
            console.error(`Error invoking image generation for shot ${shot_id}:`, invokeError);
            // Continue anyway as the prompt generation succeeded
        }

        return successResponse({ 
            success: true, 
            shot_id: shot_id, 
            visual_prompt: cleanedVisualPrompt 
        });
        
    } catch (error) {
        console.error(`Error in generate-visual-prompt:`, error);
        return errorResponse(error.message || 'Failed to generate visual prompt', 500);
    }
});
