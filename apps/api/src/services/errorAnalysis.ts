import { OPENAI_API_KEY, LLM_API_URL } from '../config.js';

export type ErrorAnalysisResult = {
    userFriendlyExplanation: string;
    fixPrompt: string;
    errorCategory?: 'syntax' | 'dependency' | 'build-config' | 'runtime' | 'unknown';
};

/**
 * Analyzes build errors using OpenAI's gpt-4o-mini model.
 * Only analyzes the error message, not the entire codebase.
 * 
 * @param errorMessage - The raw error message from the build process
 * @param buildMetadata - Optional metadata about the build (app title, author, etc.)
 * @returns Analysis with user-friendly explanation and fix prompt
 */
export async function analyzeBuildError(
    errorMessage: string,
    buildMetadata?: {
        appTitle?: string;
        slug?: string;
        creatorLanguage?: string;
    }
): Promise<ErrorAnalysisResult | null> {
    // Skip if no API key configured
    if (!OPENAI_API_KEY) {
        console.warn('[error-analysis] OpenAI API key not configured, skipping error analysis');
        return null;
    }

    // Truncate very long error messages to save tokens (keep last 4000 chars which are most relevant)
    const truncatedError = errorMessage.length > 4000
        ? '...[truncated]\n' + errorMessage.slice(-4000)
        : errorMessage;

    const userLanguage = buildMetadata?.creatorLanguage || 'en';
    const languageInstruction = getLanguageInstruction(userLanguage);

    const systemPrompt = `You are an expert developer assistant helping users fix build errors in their web applications. Your job is to:
1. Explain the error in simple, user-friendly terms
2. Generate a precise fix prompt they can use in their AI coding assistant

Be concise, friendly, and actionable.${languageInstruction}`;

    const userPrompt = `A user's web application build failed with this error:

\`\`\`
${truncatedError}
\`\`\`

${buildMetadata?.appTitle ? `App name: "${buildMetadata.appTitle}"` : ''}

Please analyze this error and provide:

1. **User-Friendly Explanation**: A brief explanation (2-3 sentences) of what went wrong, written for someone who may not be a developer.

2. **Fix Prompt**: A ready-to-use prompt the user can copy-paste into their AI assistant (like ChatGPT, Claude, etc.) to fix this specific error. The prompt should:
   - Reference the specific error
   - Ask to fix the exact file(s) and line(s) mentioned
   - Be clear and actionable

3. **Category**: One of: syntax, dependency, build-config, runtime, unknown

Respond in JSON format:
{
  "userFriendlyExplanation": "...",
  "fixPrompt": "...",
  "errorCategory": "..."
}`;

    try {
        const response = await fetch(`${LLM_API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.3, // Lower temperature for more consistent, factual responses
                max_tokens: 800,
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[error-analysis] OpenAI API error:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            console.warn('[error-analysis] No content in OpenAI response');
            return null;
        }

        const parsed = JSON.parse(content) as ErrorAnalysisResult;

        console.log('[error-analysis] Successfully analyzed error:', {
            category: parsed.errorCategory,
            explanationLength: parsed.userFriendlyExplanation.length,
            promptLength: parsed.fixPrompt.length,
        });

        return parsed;

    } catch (err: any) {
        console.error('[error-analysis] Failed to analyze error:', err.message);
        return null;
    }
}

function getLanguageInstruction(language: string): string {
    switch (language.toLowerCase()) {
        case 'hr':
            return '\n\nIMPORTANT: Respond in Croatian (Hrvatski). Both the explanation and fix prompt must be in Croatian.';
        case 'de':
            return '\n\nIMPORTANT: Respond in German (Deutsch). Both the explanation and fix prompt must be in German.';
        default:
            return '\n\nIMPORTANT: Respond in English.';
    }
}
