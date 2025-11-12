// --- QUALITY CHECK AUTOMATION ---
// This script analyzes the AI-generated draft for brand voice compliance
// and writes quality metrics back to the record.

// --- 1. CONFIGURATION ---
const SOURCE_BASE_ID = "appUuViqIBmzCCZXg";
const SOURCE_TABLE_ID = "tbluenLXB4BtWLDB0";

// Field to READ
const DRAFT_FIELD = "AI First Draft";

// Fields to WRITE (quality metrics)
const QUALITY_SCORE_FIELD = "Brand Voice Quality Score";
const QUALITY_ISSUES_FIELD = "Quality Issues";
const HAS_CONTRACTIONS_FIELD = "Has Contractions";
const HAS_EM_DASHES_FIELD = "Has Em Dashes";
const HAS_PROHIBITED_FIELD = "Has Prohibited Phrases";
const PARAGRAPH_RATIO_FIELD = "Paragraph Ratio";

// --- 2. GET INPUT VARIABLES ---
const inputConfig = input.config();
const sourceRecordId = inputConfig.recordId;

// Get the Airtable API key
let airtableApiKey;
try {
    airtableApiKey = input.secret('airtableApiKey');
    if (!airtableApiKey) {
        throw new Error("Airtable API key is missing or empty.");
    }
} catch (e) {
    console.error("Error getting Airtable API key:", e);
    return;
}

// --- 3. FETCH THE DRAFT FROM SOURCE BASE ---
console.log("Fetching draft for record:", sourceRecordId);

const fetchUrl = `https://api.airtable.com/v0/${SOURCE_BASE_ID}/${SOURCE_TABLE_ID}/${sourceRecordId}`;
let recordData;

try {
    const fetchResponse = await fetch(fetchUrl, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${airtableApiKey}`,
            "Content-Type": "application/json"
        }
    });

    if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch record: ${await fetchResponse.text()}`);
    }

    recordData = await fetchResponse.json();
} catch (e) {
    console.error("Error fetching record:", e);
    return;
}

const draftContent = recordData.fields[DRAFT_FIELD];

if (!draftContent) {
    console.log("No draft content found. Exiting.");
    return;
}

console.log("Draft length:", draftContent.length, "characters");

// --- 4. RUN QUALITY CHECKS ---

const issues = [];
let score = 100; // Start at perfect, deduct points for issues

// CHECK 1: Contractions (essential for conversational tone)
const contractionPatterns = [
    "we're", "you're", "they're", "it's", "that's",
    "we'll", "you'll", "they'll",
    "we've", "you've", "they've",
    "don't", "won't", "can't", "shouldn't", "wouldn't",
    "there's", "here's", "what's", "isn't", "aren't"
];

const hasContractions = contractionPatterns.some(pattern =>
    draftContent.toLowerCase().includes(pattern)
);

if (!hasContractions) {
    score -= 15;
    issues.push("❌ No contractions detected - sounds too formal");
}

// Count contractions
const contractionCount = contractionPatterns.reduce((count, pattern) => {
    const regex = new RegExp(pattern, 'gi');
    const matches = draftContent.match(regex);
    return count + (matches ? matches.length : 0);
}, 0);

console.log("Contractions found:", contractionCount);

// CHECK 2: Em dashes (strictly prohibited)
const hasEmDashes = draftContent.includes('—') || draftContent.includes('--');

if (hasEmDashes) {
    score -= 20;
    issues.push("❌ Contains em dashes (—) - strictly prohibited");
}

// CHECK 3: Semicolons (avoid in external comms)
const hasSemicolons = draftContent.includes(';');

if (hasSemicolons) {
    score -= 10;
    issues.push("⚠️ Contains semicolons - avoid in external communications");
}

// CHECK 4: Prohibited phrases
const prohibitedPhrases = [
    "please be advised", "kindly note", "we wish to inform you",
    "pursuant to", "hereby", "heretofore",
    "easy", "quick", "just", "simply",
    "disruptive", "hassle", "burden", "inconvenience"
];

const foundProhibited = [];
prohibitedPhrases.forEach(phrase => {
    if (draftContent.toLowerCase().includes(phrase)) {
        foundProhibited.push(phrase);
    }
});

const hasProhibited = foundProhibited.length > 0;

if (hasProhibited) {
    score -= 15;
    issues.push(`❌ Contains prohibited phrases: ${foundProhibited.join(', ')}`);
}

// CHECK 5: Greeting rule (should start with "Ahoy!" or directly with content)
const startsWithAhoy = draftContent.trim().toLowerCase().startsWith('ahoy');
const firstLine = draftContent.trim().split('\n')[0].toLowerCase();
const hasOtherGreeting = firstLine.includes('hello') ||
                         firstLine.includes('hi there') ||
                         firstLine.includes('dear');

if (hasOtherGreeting) {
    score -= 5;
    issues.push("⚠️ Uses generic greeting instead of 'Ahoy!' or direct opening");
}

// CHECK 6: Paragraph vs bullet ratio
const bulletPoints = draftContent.match(/^[\s]*[-•*]\s/gm);
const bulletCount = bulletPoints ? bulletPoints.length : 0;

// Rough estimate: count newlines as paragraph breaks
const lines = draftContent.split('\n').filter(line => line.trim().length > 0);
const paragraphCount = lines.length - bulletCount;

const totalContent = paragraphCount + bulletCount;
const paragraphRatio = totalContent > 0 ? (paragraphCount / totalContent) : 1;

console.log("Paragraph count:", paragraphCount);
console.log("Bullet count:", bulletCount);
console.log("Paragraph ratio:", (paragraphRatio * 100).toFixed(1) + "%");

if (paragraphRatio < 0.6) {
    score -= 15;
    issues.push(`⚠️ Too many bullets (${(paragraphRatio * 100).toFixed(0)}% paragraphs) - should default to narrative flow`);
} else if (paragraphRatio < 0.8) {
    score -= 5;
    issues.push(`⚠️ Could use more narrative paragraphs (${(paragraphRatio * 100).toFixed(0)}% currently)`);
}

// CHECK 7: Passive voice detection (simple heuristic)
const passiveIndicators = ['was', 'were', 'been', 'being', 'be'];
const passiveCount = passiveIndicators.reduce((count, word) => {
    const regex = new RegExp(`\\b${word}\\s+\\w+ed\\b`, 'gi');
    const matches = draftContent.match(regex);
    return count + (matches ? matches.length : 0);
}, 0);

if (passiveCount > 3) {
    score -= 5;
    issues.push(`⚠️ Possible passive voice detected (${passiveCount} instances) - use active voice`);
}

// Ensure score doesn't go below 0
score = Math.max(0, score);

// Build quality summary
let qualitySummary = "";

if (score >= 90) {
    qualitySummary = `✅ Excellent (${score}/100)\n\n`;
} else if (score >= 75) {
    qualitySummary = `✓ Good (${score}/100)\n\n`;
} else if (score >= 60) {
    qualitySummary = `⚠️ Needs Improvement (${score}/100)\n\n`;
} else {
    qualitySummary = `❌ Significant Issues (${score}/100)\n\n`;
}

if (issues.length === 0) {
    qualitySummary += "All brand voice guidelines followed! 🎉";
} else {
    qualitySummary += "Issues to address:\n" + issues.join('\n');
}

console.log("\n=== QUALITY CHECK RESULTS ===");
console.log("Score:", score);
console.log("Issues:", issues.length);
console.log(qualitySummary);

// --- 5. WRITE RESULTS BACK TO AIRTABLE ---

const updatePayload = {
    fields: {
        [QUALITY_SCORE_FIELD]: score,
        [QUALITY_ISSUES_FIELD]: qualitySummary,
        [HAS_CONTRACTIONS_FIELD]: hasContractions,
        [HAS_EM_DASHES_FIELD]: hasEmDashes,
        [HAS_PROHIBITED_FIELD]: hasProhibited,
        [PARAGRAPH_RATIO_FIELD]: paragraphRatio
    }
};

try {
    const updateUrl = `https://api.airtable.com/v0/${SOURCE_BASE_ID}/${SOURCE_TABLE_ID}/${sourceRecordId}`;

    const updateResponse = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${airtableApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
        throw new Error(`Failed to update record: ${await updateResponse.text()}`);
    }

    console.log("✓ Quality metrics written successfully!");

} catch (e) {
    console.error("Error writing quality metrics:", e);
    return;
}

console.log("Quality check complete!");
