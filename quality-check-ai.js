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

const qualityCheckPrompt = `Analyze this Twilio communication draft for brand voice compliance.

CHECK FOR:
- Narrative paragraphs (not bullet lists)
- Contractions (we're, you'll, don't)
- No em dashes (—), no semicolons
- No "easy/quick/just/simply"
- Warm, conversational tone
- Starts with "Ahoy!" or direct (for serious topics)

DRAFT:
${draftContent}

PROVIDE:
1. Score (0-100)
2. Top 2 strengths
3. Top 2 issues (if any)
4. 1-2 quick fixes

Be brief and specific.`;

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
