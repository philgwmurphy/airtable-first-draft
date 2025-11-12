// --- QUALITY CHECK AUTOMATION (NO EXTRA FIELDS NEEDED) ---
// This script analyzes the AI-generated draft and logs results to console.
// Optionally writes a summary to a single "Quality Notes" field if you create one.

// --- 1. CONFIGURATION ---
const DRAFT_FIELD = "AI First Draft";
const QUALITY_NOTES_FIELD = "Quality Notes"; // Optional - create this field or set to null

// --- 2. GET RECORD FROM TRIGGER ---
const inputConfig = input.config();
const recordId = inputConfig.recordId;

// Get the synced table and fetch the record
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

console.log("Analyzing draft (" + draftContent.length + " characters)...\n");

// --- 3. RUN QUALITY CHECKS ---

const issues = [];
let score = 100;

// CHECK 1: Contractions
const contractionPatterns = [
    "we're", "you're", "they're", "it's", "that's",
    "we'll", "you'll", "they'll",
    "we've", "you've", "they've",
    "don't", "won't", "can't", "shouldn't", "wouldn't",
    "there's", "here's", "what's", "isn't", "aren't"
];

const contractionCount = contractionPatterns.reduce((count, pattern) => {
    const regex = new RegExp(pattern, 'gi');
    const matches = draftContent.match(regex);
    return count + (matches ? matches.length : 0);
}, 0);

const hasContractions = contractionCount > 0;

if (!hasContractions) {
    score -= 15;
    issues.push("❌ No contractions - sounds too formal");
} else if (contractionCount < 3) {
    score -= 5;
    issues.push("⚠️ Only " + contractionCount + " contractions - use more for conversational flow");
}

// CHECK 2: Em dashes
const hasEmDashes = draftContent.includes('—') || draftContent.includes('--');
if (hasEmDashes) {
    score -= 20;
    issues.push("❌ Contains em dashes (—) - strictly prohibited");
}

// CHECK 3: Semicolons
const hasSemicolons = draftContent.includes(';');
if (hasSemicolons) {
    score -= 10;
    issues.push("⚠️ Contains semicolons - avoid in external communications");
}

// CHECK 4: Prohibited phrases
const prohibitedPhrases = [
    "please be advised", "kindly note", "we wish to inform you",
    "pursuant to", "hereby", "heretofore", "disruptive"
];

// Words to flag (not always wrong, but discouraged)
const discouragedWords = ["easy", "quick", "just", "simply"];

const foundProhibited = prohibitedPhrases.filter(phrase =>
    draftContent.toLowerCase().includes(phrase)
);

const foundDiscouraged = discouragedWords.filter(word =>
    new RegExp('\\b' + word + '\\b', 'i').test(draftContent)
);

if (foundProhibited.length > 0) {
    score -= 15;
    issues.push("❌ Prohibited phrases: " + foundProhibited.join(', '));
}

if (foundDiscouraged.length > 0) {
    score -= 5;
    issues.push("⚠️ Discouraged words: " + foundDiscouraged.join(', '));
}

// CHECK 5: Greeting
const startsWithAhoy = draftContent.trim().toLowerCase().startsWith('ahoy');
const firstLine = draftContent.trim().split('\n')[0].toLowerCase();
const hasGenericGreeting = firstLine.includes('hello') ||
                           firstLine.includes('hi there') ||
                           firstLine.includes('dear');

if (hasGenericGreeting) {
    score -= 5;
    issues.push("⚠️ Generic greeting - consider 'Ahoy!' or direct opening");
} else if (startsWithAhoy) {
    console.log("✓ Starts with 'Ahoy!'");
}

// CHECK 6: Paragraph vs Bullets
const bulletMatches = draftContent.match(/^[\s]*[-•*]\s/gm);
const bulletCount = bulletMatches ? bulletMatches.length : 0;
const lines = draftContent.split('\n').filter(line => line.trim().length > 20);
const totalLines = lines.length;
const paragraphRatio = totalLines > 0 ? (totalLines - bulletCount) / totalLines : 1;

if (paragraphRatio < 0.6) {
    score -= 15;
    issues.push("❌ Too many bullets (" + Math.round(paragraphRatio * 100) + "% paragraphs) - default to narrative");
} else if (paragraphRatio < 0.8) {
    score -= 5;
    issues.push("⚠️ Could use more narrative (" + Math.round(paragraphRatio * 100) + "% paragraphs)");
}

// CHECK 7: Passive voice (simple detection)
const passiveMatches = draftContent.match(/\b(was|were|been|being)\s+\w+ed\b/gi);
const passiveCount = passiveMatches ? passiveMatches.length : 0;

if (passiveCount > 3) {
    score -= 5;
    issues.push("⚠️ Possible passive voice (" + passiveCount + " instances) - use active voice");
}

// Ensure score doesn't go negative
score = Math.max(0, score);

// --- 4. LOG RESULTS ---

console.log("\n═══════════════════════════════════════");
console.log("     BRAND VOICE QUALITY CHECK");
console.log("═══════════════════════════════════════\n");

console.log("📊 OVERALL SCORE: " + score + "/100");

if (score >= 90) {
    console.log("✅ Excellent - follows all guidelines!\n");
} else if (score >= 75) {
    console.log("✓ Good - minor improvements possible\n");
} else if (score >= 60) {
    console.log("⚠️ Needs improvement\n");
} else {
    console.log("❌ Significant issues to address\n");
}

console.log("📈 METRICS:");
console.log("  • Contractions: " + contractionCount);
console.log("  • Paragraph ratio: " + Math.round(paragraphRatio * 100) + "%");
console.log("  • Bullet points: " + bulletCount);
console.log("  • Passive voice: " + passiveCount + " instances");
console.log("  • Em dashes: " + (hasEmDashes ? "Yes ❌" : "No ✓"));
console.log("  • Semicolons: " + (hasSemicolons ? "Yes ⚠️" : "No ✓"));

if (issues.length > 0) {
    console.log("\n⚠️ ISSUES TO ADDRESS:");
    issues.forEach(issue => console.log("  " + issue));
} else {
    console.log("\n🎉 No issues found - perfect compliance!");
}

console.log("\n═══════════════════════════════════════\n");

// --- 5. OPTIONAL: WRITE SUMMARY TO SINGLE FIELD ---

// Uncomment this section if you want to save results to Airtable
// You'll need to create a "Quality Notes" field (Long text)
/*
const summary = `Score: ${score}/100\n${issues.length > 0 ? '\nIssues:\n' + issues.join('\n') : '\n✅ All guidelines followed!'}`;

await table.updateRecordAsync(recordId, {
    [QUALITY_NOTES_FIELD]: summary
});

console.log("Quality summary written to '" + QUALITY_NOTES_FIELD + "' field");
*/
