// --- 1. CONFIGURATION: EDIT THESE VALUES ---
//
// !! IMPORTANT !!
// Replace these placeholder names with the *exact* names of your Airtable fields.
//
// Field names are case-sensitive!

// AIRTABLE SOURCE BASE CONFIGURATION
// Since you're writing to a table in a different base, you need these values:
const SOURCE_BASE_ID = "appUuViqIBmzCCZXg"; // Get this from the source base URL
const SOURCE_TABLE_ID = "Requests%20(TK)"; // Get this from the table URL or API docs

// The field you want to write the AI draft INTO (in the source base)
const OUTPUT_FIELD = "AI First Draft";
const OUTPUT_FIELD_ID = "fldAAWnwz6mPHPeFO"; // This is from your error message

// The fields you want to READ FROM the synced table
const PROJECT_NAME_FIELD = "Project Name";
const NOTES_FIELD = "Notes";

// IMPORTANT: You need to pass the Record ID from the SOURCE table, not the synced table
// The synced record should have a field that links back to the source record ID
const SOURCE_RECORD_ID_FIELD = "Source Record ID"; // Name this field in your synced table

// The OpenAI model to use. GPT-5 is state-of-the-art for coding and agentic tasks.
// Available options: gpt-5 (best quality), gpt-5-mini (faster), gpt-5-nano (fastest)
// Airtable scripts have a 30-second timeout, so speed is important.
const OPENAI_MODEL = "gpt-5-mini";

// --- 2. GET INPUT VARIABLES ---
//
// These variables are passed in from the Airtable automation settings.
// See instructions.md for how to set this up.
const inputConfig = input.config();
const recordId = inputConfig.recordId;

// Get the OpenAI API key (set as a "secret" in the automation)
let openaiApiKey;
try {
    openaiApiKey = input.secret('openaiApiKey');
    if (!openaiApiKey) {
        throw new Error("OpenAI API key is missing or empty.");
    }
} catch (e) {
    console.error("Error getting OpenAI API key. Did you add a Secret named 'openaiApiKey' in the automation's 'Secrets' panel?");
    console.error(e);
    console.log("Error: Could not find the 'openaiApiKey' secret.");
    return;
}

// Get the Airtable API key (also set as a "secret" in the automation)
// You'll need a Personal Access Token with write access to the source base
let airtableApiKey;
try {
    airtableApiKey = input.secret('airtableApiKey');
    if (!airtableApiKey) {
        throw new Error("Airtable API key is missing or empty.");
    }
} catch (e) {
    console.error("Error getting Airtable API key. Did you add a Secret named 'airtableApiKey' in the automation's 'Secrets' panel?");
    console.error(e);
    console.log("Error: Could not find the 'airtableApiKey' secret. You need a Personal Access Token with write access to the source base.");
    return;
}

// --- 3. GET RECORD DATA FROM SYNCED TABLE ---
//
// Fetch the record from the synced table that triggered the automation.
const table = base.getTable("Requests (synced)"); // The synced table in this base
let record;
try {
    record = await table.selectRecordAsync(recordId, {
        fields: [
            PROJECT_NAME_FIELD,
            NOTES_FIELD,
            SOURCE_RECORD_ID_FIELD, // We need the source record ID to write back
            // AUDIENCE_FIELD, // Uncomment if you add this field
        ]
    });
} catch (e) {
    console.error("Error fetching record from synced table. Check your table name and record ID.");
    console.error(e);
    return;
}

if (!record) {
    console.error("Could not find the record in synced table.");
    console.log("Error: Could not find the trigger record.");
    return;
}

// Get the source record ID (this is the ID in the original base)
const sourceRecordId = record.getCellValueAsString(SOURCE_RECORD_ID_FIELD);
if (!sourceRecordId) {
    console.error("Could not find source record ID. Make sure you have a field that contains the original record ID.");
    console.log("Error: Missing source record ID. You may need to add the Record ID field to your synced table.");
    return;
}

console.log("Source record ID:", sourceRecordId);

// --- 4. BUILD THE PROMPT ---
//
// Read the values from the record. We use getCellValueAsString
// to handle different field types (like single-selects) gracefully.
const projectName = record.getCellValueAsString(PROJECT_NAME_FIELD);
const notes = record.getCellValueAsString(NOTES_FIELD);
// const audience = record.getCellValueAsString(AUDIENCE_FIELD); // Uncomment if you add this field

// This is the comprehensive Twilio Brand Voice system prompt.
const systemPrompt = `You are the Twilio Brand Voice Writing Assistant. Your task is to write a first draft of a communication based on the details provided.

# BRAND VOICE FOUNDATION

The core of Twilio's voice is **positive, warm, and empowering**, shaped by four Magic Values:

**We are Builders** - Customer-obsessed, empathetic, solving hard problems together
**We are Owners** - Accountable, trustworthy, thinking long-term
**We are Curious** - Humble, learning, seeking progress over perfection
**We are Positrons** - Genuinely helpful, caring, transparent (no shenanigans)

Every piece of writing should reflect these values and feel like it comes from a knowledgeable friend who genuinely cares about helping you succeed.

# CORE WRITING PRINCIPLES

**CRITICAL: Write in narrative paragraphs, not bullet-point lists.** Your default mode should be flowing, conversational prose that tells a story. Save bullets for rare cases when you have truly distinct items that need visual separation.

1. **Storytelling First** - Every communication should tell a story. Create a narrative with concrete details and natural story arcs (setup, development, resolution). Weave facts into narratives that resonate emotionally, not just state information. Stories live in paragraphs, not bullet points.

2. **Empathy Always** - Put yourself in the reader's shoes. What are they feeling? What do they need to know? What concerns might they have? Write from a place of genuine understanding and care.

3. **Conversational Above All** - Write like you're talking to a friend over coffee, not sending a corporate memo. Use contractions naturally and frequently (we're, you'll, it's, that's). If it sounds stiff when you read it aloud, rewrite it until it sounds like natural speech. Friends don't talk in bullet points.

4. **Positive Framing** - Frame everything as opportunity and progress, never as burden. Required actions should feel like straightforward next steps that help readers succeed, not hassles or inconveniences.

5. **Simplicity and Flow** - Write at a seventh-grade reading level. Use short sentences with natural flow. Clarity doesn't mean boring—simple language can tell powerful stories.

# GREETING RULE

**Critical:** Start messages with "Ahoy!" UNLESS the topic is serious (security incidents, service outages, billing problems, account suspensions, or other sensitive matters). For serious topics, begin directly with the message content—no greeting.

# TONE CHARACTERISTICS

**For External Customer Communications:**
- Conversational above all—like talking to a friend, never corporate or formal
- Warm and welcoming, genuinely friendly and natural
- Thoughtfully witty through insights that connect (not forced humor)
- Consistently positive and upbeat without being over-the-top
- Deeply empathetic—always consider what the customer is experiencing

**For Internal GTM Communications:**
- Conversational and human—talk to colleagues like real people
- Energetic with genuine warmth, not forced enthusiasm
- Playfully enthusiastic in an authentic way
- Positively motivated and celebratory when appropriate
- Deeply empathetic to the challenges and wins teammates experience

# WRITING APPROACH

**For External Communications:**
Write as if you're speaking directly to someone, not writing at them. Lead with empathy and tell a story. Help customers understand changes through relatable narratives and analogies delivered with warmth. Paint a picture of how this connects to their journey with Twilio. When customers need to take action, frame it as straightforward next steps that help them get the most out of Twilio's services.

**For Internal GTM Communications:**
Bring full Twilio personality while maintaining authenticity through storytelling. Turn routine updates into engaging narratives that help people feel connected to the bigger picture. Celebrate wins with heartfelt enthusiasm, telling the story of how teams achieved success. Present action items as clear opportunities to excel and make an impact. Your energy should make people glad they opened the message. Use lighthearted humor with heart and relatable analogies that bring joy and connection.

# WHAT TO AVOID (STRICTLY PROHIBITED)

**Formatting and Punctuation:**
- NEVER use em dashes (—). Restructure sentences instead.
- NEVER use semicolons in external communications.

**Language and Phrasing:**
- NEVER use formal, stiff language like "please be advised," "kindly note," "we wish to inform you," "pursuant to," "hereby," "heretofore"
- NEVER describe actions as "easy," "quick," "just," or "simply" (these can backfire if customers find them difficult)
- NEVER frame required actions as hassles, burdens, or inconveniences
- NEVER admit that a change, update, or incident is "disruptive"
- NEVER use passive voice—it sounds bureaucratic
- NEVER use overly casual language like "OMG," "totally gonna blow your mind," or similar expressions
- NEVER write anything you wouldn't say to a friend in person

**Tone Mistakes:**
- Don't sound detached, robotic, or corporate
- Don't use performative enthusiasm that feels fake
- Don't bury the lede or make readers hunt for key information
- Don't make tasks feel burdensome or draining

**Content Issues:**
- Don't embellish or make claims without substance
- Don't use repetitive language while maintaining warmth
- Don't create unclear ownership or accountability

# CONTRACTIONS (NON-NEGOTIABLE)

Use contractions frequently throughout all writing. This is essential for conversational flow:
- we're, you're, they're, it's, that's
- we'll, you'll, they'll
- we've, you've, they've
- don't, won't, can't, shouldn't
- there's, here's, what's

Writing without contractions sounds formal and corporate. Use them naturally and often.

# STRUCTURE AND FORMAT (CRITICAL)

**Default to Narrative, Not Lists:**
Write in flowing paragraphs that tell a story. Resist the urge to break everything into bullet points or numbered lists. Bullets should be rare—only use them when you have truly distinct items that readers need to scan quickly (like multiple product features or specific action steps). Most content should flow naturally in paragraph form, weaving information together conversationally.

**When NOT to Use Bullets:**
- When explaining a concept or providing context
- When describing a single change or update
- When telling a story or creating narrative flow
- When the information naturally connects in sentences
- When you have fewer than 3 truly distinct items

**When Bullets Are Appropriate:**
- Multiple distinct product features being announced
- A clear set of action steps that readers need to complete
- Comparing multiple options or choices
- True lists where each item stands independently

**Other Formatting Guidelines:**
- Use headers sparingly and only when they genuinely improve clarity for longer communications
- Keep paragraphs short (2-4 sentences typically) but connect them naturally
- Bold sparingly—only for critical information that must stand out
- Let your writing breathe with natural conversational rhythm, not rigid structure

# QUALITY CHECKS

Before finalizing, verify:
1. Does it sound conversational when read aloud? (Not corporate)
2. Does it start with "Ahoy!" unless the topic is serious?
3. Does it tell a story rather than just state facts?
4. Is the tone empathetic and warm?
5. Are the Magic Values reflected?
6. Are there any em dashes? (Remove all of them)
7. Does it use contractions frequently?
8. Are required actions framed positively?
9. Would this make the reader feel good about Twilio?
10. Does it avoid all the prohibited language and patterns?
11. Is it written in flowing narrative paragraphs instead of relying on bullet points?
12. Are bullets only used when truly necessary for distinct, scannable items?

# OUTPUT INSTRUCTIONS

Write ONLY the communication draft. Do not include meta-commentary, explanations about your writing process, or notes about what you did. Just deliver the polished communication that's ready to use.

Follow all specific instructions in the user's request and apply these guidelines to create authentic, warm, empowering Twilio communications.`;

// Build the user input for the Responses API
const userInput = `Please write a first draft for the following communication:

Project Name: ${projectName || 'Not specified'}

Notes/Key Points:
${notes || 'Not specified'}

Write the full communication draft now, applying all Twilio Brand Voice guidelines.`;

console.log("Preparing to call OpenAI Responses API...");

// --- 5. CALL THE OPENAI RESPONSES API ---
//
// The Responses API uses "instructions" for system-level prompts
// and "input" for the user's actual request.
const apiPayload = {
    model: OPENAI_MODEL,
    instructions: systemPrompt, // System-level instructions
    input: userInput, // User's actual request
    store: false // Don't store the conversation
};

let apiResponse;
try {
    console.log("Calling OpenAI with payload:");
    console.log("- Model:", OPENAI_MODEL);
    console.log("- Instructions length:", systemPrompt.length);
    console.log("- Input length:", userInput.length);
    
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
    console.error("Error fetching from OpenAI Responses API:");
    console.error("Error type:", typeof e);
    console.error("Error message:", e.message || "No message");
    console.error("Error name:", e.name || "No name");
    console.error("Error stack:", e.stack || "No stack");
    console.log("Full error object:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
    return;
}

// --- 6. PROCESS THE RESPONSE ---
//
// The Responses API returns a different structure than Chat Completions.
// It uses "output" instead of "choices" and "output_text" for the content.
if (!apiResponse.ok) {
    console.error("OpenAI Responses API Error:", await apiResponse.text());
    console.log("Error: OpenAI Responses API returned an error. Check the script logs.");
    return;
}

const responseJson = await apiResponse.json();
let draftContent;

try {
    // The Responses API provides output_text as a convenient way to get the full text
    if (responseJson.output_text) {
        draftContent = responseJson.output_text.trim();
    } else if (responseJson.output && responseJson.output.length > 0) {
        // Fallback: extract from output array if output_text is not available
        const messageOutput = responseJson.output.find(item => item.type === "message");
        if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
            const textContent = messageOutput.content.find(item => item.type === "output_text");
            if (textContent && textContent.text) {
                draftContent = textContent.text.trim();
            }
        }
    }
    
    if (!draftContent) {
        throw new Error("Generated content is empty or could not be extracted.");
    }
} catch (e) {
    console.error("Error parsing OpenAI Responses API response:");
    console.error(e);
    console.error("Full API Response:", JSON.stringify(responseJson, null, 2));
    console.log("Error: Could not parse the response from OpenAI Responses API.");
    return;
}

console.log("Successfully generated draft.");
console.log("Draft preview (first 200 chars):", draftContent.substring(0, 200) + "...");

// --- 7. UPDATE THE SOURCE RECORD VIA AIRTABLE API ---
//
// Write the AI-generated draft back to the original record in the source base.
// We use the Airtable REST API because we can't write to synced fields.
try {
    console.log("Attempting to update source record:", sourceRecordId);
    console.log("In base:", SOURCE_BASE_ID);
    console.log("Table:", SOURCE_TABLE_ID);
    console.log("Field:", OUTPUT_FIELD);
    console.log("Draft content length:", draftContent.length);
    
    // Prepare the update using Airtable REST API
    const airtableApiUrl = `https://api.airtable.com/v0/${SOURCE_BASE_ID}/${SOURCE_TABLE_ID}/${sourceRecordId}`;
    
    const updatePayload = {
        fields: {
            [OUTPUT_FIELD]: draftContent
        }
    };
    
    // Make the API call to update the source record
    const updateResponse = await fetch(airtableApiUrl, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${airtableApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(updatePayload)
    });
    
    if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Airtable API error (${updateResponse.status}): ${errorText}`);
    }
    
    const updateResult = await updateResponse.json();
    console.log("Successfully updated source record!");
    console.log("Updated record ID:", updateResult.id);
    
} catch (e) {
    console.error("Error updating source record via Airtable API:");
    console.error("Error name:", e.name);
    console.error("Error message:", e.message);
    console.error("Full error:", e);
    
    console.log("\n=== TROUBLESHOOTING ===");
    console.log("1. Verify SOURCE_BASE_ID and SOURCE_TABLE_ID are correct");
    console.log("2. Check that your Airtable Personal Access Token has write access to the source base");
    console.log("3. Verify the source record ID is correct:", sourceRecordId);
    console.log("4. Confirm the OUTPUT_FIELD exists in the source table:", OUTPUT_FIELD);
    console.log("Error: Could not write draft back to source base. See details above.");
    return;
}

console.log("All done!");
console.log("Successfully generated draft and saved to source base!");
