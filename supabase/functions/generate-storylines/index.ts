
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { safeParseJson, callClaudeApi } from '../_shared/claude.ts';
import { 
  StorylineRequestBody, 
  StorylineResponseData, 
  AnalysisResponseData,
  StorylineGenerationResult
} from './types.ts';
import { 
  getStorylineSystemPrompt, 
  getStorylineUserPrompt, 
  getAnalysisSystemPrompt, 
  getAnalysisUserPrompt 
} from './prompts.ts';
import { 
  saveStorylineData, 
  updateProjectSettings, 
  triggerCharacterImageGeneration,
  triggerShotVisualPromptGeneration 
} from './database.ts';

/**
 * Main Edge Function to generate storylines and related content
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors();
  }
  
  try {
    // Authenticate the request
    const user = await authenticateRequest(req.headers);
    
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Parse request body
    const { project_id, generate_alternative = false }: StorylineRequestBody = await req.json();
    if (!project_id) {
      return errorResponse('Project ID is required', 400);
    }
    console.log(`Received request for project ${project_id}. Generate alternative: ${generate_alternative}`);

    // Fetch project details
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('title, concept_text, genre, tone, format, custom_format_description, special_requests, product_name, target_audience, main_message, call_to_action')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      console.error('Project error:', projectError?.message);
      return errorResponse('Project not found or access denied', 404, projectError?.message);
    }

    // Get Anthropic API key
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      console.error('ANTHROPIC_API_KEY not set.');
      return errorResponse('Server configuration error: Anthropic API key not found', 500);
    }

    // Step 1: Generate storyline and scenes
    console.log('Sending request to Anthropic API for storyline generation...');
    const storylineSystemPrompt = getStorylineSystemPrompt(generate_alternative);
    const storylineUserPrompt = getStorylineUserPrompt(project, generate_alternative);
    
    const storylineContent = await callClaudeApi(
      claudeApiKey, 
      storylineSystemPrompt, 
      storylineUserPrompt, 
      generate_alternative ? 1500 : 4000
    );
    
    const storylineData = safeParseJson<StorylineResponseData>(storylineContent);
    if (!storylineData || !storylineData.primary_storyline) {
      console.error('Failed to parse valid response from Claude:', { raw_content: storylineContent });
      return errorResponse('Failed to parse valid storyline from Claude', 500, { raw_content: storylineContent });
    }

    console.log('Successfully parsed storyline from Claude response');
    const fullStoryText = storylineData.primary_storyline.full_story;

    // Step 2: Analyze storyline for characters and settings (only for main storyline, not alternatives)
    let analysisData: AnalysisResponseData | null = null;
    if (!generate_alternative) {
      try {
        console.log('Analyzing generated storyline for characters and settings...');
        const analysisSystemPrompt = getAnalysisSystemPrompt();
        const analysisUserPrompt = getAnalysisUserPrompt(fullStoryText);

        const analysisContent = await callClaudeApi(claudeApiKey, analysisSystemPrompt, analysisUserPrompt, 1000);
        analysisData = safeParseJson<AnalysisResponseData>(analysisContent);
        console.log('Analysis complete.', analysisData ? 'Parsed successfully.' : 'Parsing failed.');
      } catch (analysisError) {
        console.warn('Failed to analyze storyline:', analysisError.message);
        // Continue without analysis data if this step fails
      }
    }

    // Step 3: Save to database
    const isSelected = !generate_alternative;
    const dbResults = await saveStorylineData(
      supabaseClient,
      project_id,
      storylineData,
      isSelected,
      analysisData,
      generate_alternative
    );

    // Update project with selected storyline and potentially inferred settings
    if (Object.keys(dbResults.updatedSettings).length > 0) {
      await updateProjectSettings(supabaseClient, project_id, dbResults.updatedSettings);
    }

    // Trigger character image generation for saved characters
    if (dbResults.characters.length > 0) {
      await triggerCharacterImageGeneration(supabaseClient, project_id, dbResults.characters);
    }
    
    // Trigger visual prompt generation for created shots
    if (dbResults.inserted_shot_ids && dbResults.inserted_shot_ids.length > 0) {
      await triggerShotVisualPromptGeneration(supabaseClient, dbResults.inserted_shot_ids);
    }

    // Return success response
    const result: StorylineGenerationResult = {
      success: true,
      storyline_id: dbResults.storyline_id,
      scene_count: dbResults.scene_count,
      character_count: dbResults.character_count,
      shot_count: dbResults.inserted_shot_ids?.length || 0,
      is_alternative: generate_alternative,
      updated_settings: Object.keys(dbResults.updatedSettings).filter(k => k !== 'selected_storyline_id'),
      potential_genre: analysisData?.potential_genre,
      potential_tone: analysisData?.potential_tone
    };

    return successResponse(result);

  } catch (error) {
    console.error('Error in generate-storylines function:', error);
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof SyntaxError) {
      console.error('JSON Parsing Error:', error.message);
      return errorResponse('Failed to parse request body or API response', 400, { detail: error.message });
    }
    return errorResponse(error.message || 'Internal server error', 500);
  }
});
