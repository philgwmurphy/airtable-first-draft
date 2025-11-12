// --- AI-POWERED QUALITY CHECK AUTOMATION ---
// Uses OpenAI to analyze the draft against Twilio brand voice guidelines
// Logs results to console (optionally writes to "Quality Notes" field)

// --- 1. CONFIGURATION ---
const DRAFT_FIELD = "AI First Draft";
const QUALITY_NOTES_FIELD = "Quality Notes"; // Optional - set to null if you don't want to save results

// Use fast model for quick analysis
const OPENAI_MODEL = "gpt-5-nano";

// --- 2. GET INPUT VARIABLES ---
const inputConfig = input.config();
const recordId = inputConfig.recordId;

// Get the OpenAI API key
let openaiApiKey;
try {
    openaiApiKey = input.secret('openaiApiKey');
    if (!openaiApiKey) {
        throw new Error("OpenAI API key is missing or empty.");
    }
} catch (e) {
    console.error("Error getting OpenAI API key:", e);
    console.log("Error: Could not find the 'openaiApiKey' secret.");
    return;
}

// --- 3. GET RECORD FROM SYNCED TABLE ---
const table = base.getTable("Requests (synced)");
const record = await table.selectRecordAsync(recordId, {
    fields: [DRAFT_FIELD]
});

if (!record) {
    console.error("Could not find record");
    return;
}

const draftContent = record.getCellValueAsString(DRAFT_FIELD);

if (!draftContent) {
    console.log("No draft content found. Exiting.");
    return;
}

console.log("Analyzing draft (" + draftContent.length + " characters) with AI...");

// --- 4. BUILD QUALITY CHECK PROMPT ---

const qualityCheckPrompt = `You are a Twilio Brand Voice Quality Checker. Analyze the following communication draft against Twilio's brand voice guidelines and provide a detailed assessment.

# BRAND VOICE GUIDELINES TO CHECK

**Core Requirements:**
1. **Narrative Paragraphs Over Bullets** - Should default to flowing conversational prose, not bullet-point lists. Bullets only for truly distinct scannable items.
2. **Empathy & Warmth** - Should feel genuinely caring, like a thoughtful friend who wants to help
3. **Conversational Tone** - Use contractions frequently (we're, you'll, it's, don't, etc.). Never formal or corporate.
4. **Storytelling** - Weave facts into narratives with concrete details, not dry information
5. **Positive Framing** - Frame actions as opportunities, never as burdens

**Greeting Rule:**
- Should start with "Ahoy!" UNLESS topic is serious (security, outages, billing issues)
- For serious topics, start directly with content

**Strictly Prohibited:**
- Em dashes (—)
- Semicolons in external communications
- Formal language: "please be advised," "kindly note," "pursuant to," "hereby"
- Words suggesting ease: "easy," "quick," "just," "simply"
- "Disruptive" when describing changes
- Passive voice
- Overly casual: "OMG," "totally gonna blow your mind"

# DRAFT TO ANALYZE

${draftContent}

# YOUR TASK

Provide a quality assessment with:

1. **Overall Score** (0-100) based on brand voice compliance
2. **Score Breakdown:**
   - Narrative Flow (paragraphs vs bullets): X/20
   - Empathy & Warmth: X/20
   - Conversational Tone (contractions, etc.): X/20
   - Storytelling: X/20
   - Adherence to Rules (no prohibited elements): X/20

3. **Strengths** - What the draft does well (2-3 specific examples)

4. **Issues to Fix** - Any violations or problems (be specific, quote examples)

5. **Suggestions** - 2-3 concrete improvements to strengthen brand voice

Be honest and specific. Quote examples from the draft to illustrate points.

Format your response clearly with headers for each section.`;

// --- 5. CALL OPENAI RESPONSES API ---

const apiPayload = {
    model: OPENAI_MODEL,
    instructions: "You are an expert brand voice quality analyst. Provide thorough, specific, actionable feedback.",
    input: qualityCheckPrompt,
    store: false
};

console.log("Calling OpenAI for quality analysis...");

let apiResponse;
try {
    apiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify(apiPayload)
    });

    console.log("API Response Status:", apiResponse.status);
} catch (e) {
    console.error("Error calling OpenAI:", e);
    return;
}

if (!apiResponse.ok) {
    console.error("OpenAI API Error:", await apiResponse.text());
    return;
}

const responseJson = await apiResponse.json();
let qualityAnalysis;

try {
    if (responseJson.output_text) {
        qualityAnalysis = responseJson.output_text.trim();
    } else if (responseJson.output && responseJson.output.length > 0) {
        const messageOutput = responseJson.output.find(item => item.type === "message");
        if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
            const textContent = messageOutput.content.find(item => item.type === "output_text");
            if (textContent && textContent.text) {
                qualityAnalysis = textContent.text.trim();
            }
        }
    }

    if (!qualityAnalysis) {
        throw new Error("Could not extract quality analysis from response");
    }
} catch (e) {
    console.error("Error parsing response:", e);
    console.error("Full response:", JSON.stringify(responseJson, null, 2));
    return;
}

// --- 6. LOG RESULTS ---

console.log("\n═══════════════════════════════════════");
console.log("   AI BRAND VOICE QUALITY ANALYSIS");
console.log("═══════════════════════════════════════\n");

console.log(qualityAnalysis);

console.log("\n═══════════════════════════════════════\n");

// --- 7. OPTIONAL: WRITE TO AIRTABLE ---

// Uncomment this section to save results to a "Quality Notes" field
/*
if (QUALITY_NOTES_FIELD) {
    try {
        await table.updateRecordAsync(recordId, {
            [QUALITY_NOTES_FIELD]: qualityAnalysis
        });
        console.log("✓ Quality analysis saved to '" + QUALITY_NOTES_FIELD + "' field");
    } catch (e) {
        console.error("Error saving to Airtable:", e);
    }
}
*/

console.log("Quality check complete!");
