// --- ULTRA-FAST VERSION WITH COMPRESSED PROMPT ---
// Same configuration as your existing script, just with minimal prompt

// --- 1. CONFIGURATION: EDIT THESE VALUES ---
const SOURCE_BASE_ID = "appUuViqIBmzCCZXg";
const SOURCE_TABLE_ID = "tbluenLXB4BtWLDB0";
const OUTPUT_FIELD = "AI First Draft";
const PROJECT_NAME_FIELD = "Project Name";
const NOTES_FIELD = "Notes";
const SOURCE_RECORD_ID_FIELD = "Source Record ID";
const OPENAI_MODEL = "gpt-5-nano";

// --- 2. GET INPUT VARIABLES ---
const inputConfig = input.config();
const recordId = inputConfig.recordId;

let openaiApiKey;
try {
    openaiApiKey = input.secret('openaiApiKey');
    if (!openaiApiKey) throw new Error("OpenAI API key missing");
} catch (e) {
    console.error("Error getting OpenAI API key:", e);
    return;
}

let airtableApiKey;
try {
    airtableApiKey = input.secret('airtableApiKey');
    if (!airtableApiKey) throw new Error("Airtable API key missing");
} catch (e) {
    console.error("Error getting Airtable API key:", e);
    return;
}

// --- 3. GET RECORD DATA ---
const table = base.getTable("Requests (synced)");
let record;
try {
    record = await table.selectRecordAsync(recordId, {
        fields: [PROJECT_NAME_FIELD, NOTES_FIELD, SOURCE_RECORD_ID_FIELD]
    });
} catch (e) {
    console.error("Error fetching record:", e);
    return;
}

if (!record) {
    console.error("Could not find record");
    return;
}

const sourceRecordId = record.getCellValueAsString(SOURCE_RECORD_ID_FIELD);
if (!sourceRecordId) {
    console.error("Missing source record ID");
    return;
}

const projectName = record.getCellValueAsString(PROJECT_NAME_FIELD);
const notes = record.getCellValueAsString(NOTES_FIELD);

console.log("Source record ID:", sourceRecordId);

// --- 4. ULTRA-COMPRESSED PROMPT ---

// Minimal system prompt - all essential guidelines in ~2000 chars
const systemPrompt = `You are the Twilio Brand Voice Writing Assistant. Write warm, empathetic, empowering communications.

**Magic Values**: Builders (customer-obsessed), Owners (trustworthy), Curious (learning), Positrons (helpful, transparent)

**CRITICAL RULES:**
1. Write in narrative PARAGRAPHS, not bullets (bullets only for 3+ truly distinct items)
2. Lead with empathy - understand reader's feelings/needs
3. Conversational - use contractions (we're, you'll, don't), never formal
4. Tell stories with concrete details, not dry facts
5. Start with "Ahoy!" (skip for serious topics: security, outages, billing issues)

**NEVER USE:**
- Em dashes (—), semicolons
- "easy/quick/just/simply", "disruptive", "please be advised", "kindly note"
- Passive voice, formal corporate language
- Anything you wouldn't say to a friend

**TONE:**
- External: Warm friend excited to help, deeply empathetic
- Internal: Human, energizing, celebrate wins genuinely

Write ONLY the communication draft, no meta-commentary.`;

const userInput = `Write a first draft for:

Project: ${projectName || 'Not specified'}
Notes: ${notes || 'Not specified'}

Apply all Twilio Brand Voice guidelines.`;

console.log("Calling OpenAI...");
console.log("- Model:", OPENAI_MODEL);
console.log("- Prompt length:", systemPrompt.length);

// --- 5. CALL OPENAI WITH TOKEN LIMIT ---

const apiPayload = {
    model: OPENAI_MODEL,
    instructions: systemPrompt,
    input: userInput,
    store: false,
    max_completion_tokens: 1000 // Limit for faster response
};

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
    console.error("OpenAI Error:", await apiResponse.text());
    return;
}

// --- 6. EXTRACT DRAFT ---

const responseJson = await apiResponse.json();
let draftContent;

try {
    if (responseJson.output_text) {
        draftContent = responseJson.output_text.trim();
    } else if (responseJson.output && responseJson.output.length > 0) {
        const messageOutput = responseJson.output.find(item => item.type === "message");
        if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
            const textContent = messageOutput.content.find(item => item.type === "output_text");
            if (textContent && textContent.text) {
                draftContent = textContent.text.trim();
            }
        }
    }

    if (!draftContent) {
        throw new Error("No content generated");
    }
} catch (e) {
    console.error("Error parsing response:", e);
    return;
}

console.log("Draft generated (" + draftContent.length + " characters)");

// --- 7. WRITE TO SOURCE BASE ---

try {
    const updateUrl = `https://api.airtable.com/v0/${SOURCE_BASE_ID}/${SOURCE_TABLE_ID}/${sourceRecordId}`;

    const updateResponse = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${airtableApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: {
                [OUTPUT_FIELD]: draftContent
            }
        })
    });

    if (!updateResponse.ok) {
        throw new Error(`Airtable API error: ${await updateResponse.text()}`);
    }

    console.log("✓ Draft written to source base!");

} catch (e) {
    console.error("Error writing to Airtable:", e);
    return;
}

console.log("Complete!");
