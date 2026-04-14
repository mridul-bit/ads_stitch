Project Summary: The AI Landing Page Tailor
A Next.js Project that acts like a digital tailor. It takes a standard landing page  and an ad creative (text or image) and instantly alters the page to fit that specific ad perfectly using Gemini API.
It extracts the html elements from the Landing Page using cheerio and replace its text using the new ad creative enhanced text

Instead of showing every visitor the same generic message, the AI "reads" the page, "looks" at the ad (even images!), and rewrites the copy to make sure the transition from clicking an ad to viewing the page is seamless.

 How We Handled the "Chaos"
AI can be like a very talented but easily distracted intern. To make this production-ready, we had to build "guardrails" to handle four specific problems:

1. Random Changes (Context Loss)
The Problem: Originally, the AI didn't know the difference between a massive headline and a tiny "Log In" link. It would often put the main discount offer everywhere, making the page look like spam.
The Solution: * Contextual Tagging: During extraction, we now tell the AI exactly what each piece of text is (e.g., "This is an H1 Headline," "This is a Button").

Hierarchy Rules: We gave the AI a "Rulebook." It's now instructed that the Main Offer belongs in the headlines, Benefits go in the paragraphs, and Actions go only on the buttons. This keeps the page's logic intact.

2. Broken UI (Layout Shifts)
The Problem: AI loves to talk. If the original button said "Join," and the AI rewrote it to "Click here right now to claim your amazing 20% discount," the button would grow so large it would break the website layout.
The Solution:

The leng_old Anchor: We started measuring the exact character count of every original element. We pass this number to the AI as a hard limit.

UI Guardrails: We updated the AI’s "brain" (the Schema) to require it to acknowledge the old length before writing the new text. We told it: "You can be better, but you can't be significantly longer."

3. Hallucinations (AI "Making Things Up")
The Problem: Sometimes the AI would get "too creative" and invent discounts or features that didn't exist in the original ad.
The Solution:

Two-Step DNA Extraction: Instead of asking the AI to rewrite the page in one go, we forced it to perform "DNA Extraction" first. It must list the Offer, Urgency, CTA, and Tone into a structured summary.

Grounding: The second step (the rewrite) is strictly "grounded" in that DNA. The AI is told it is a "CRO (Conversion Rate Optimization) Expert," which shifts its persona from a "creative writer" to a "results-driven editor."

4. Inconsistent Outputs (Broken Code)
The Problem: AI often returns conversational text like "Here is your JSON..." which breaks the code. Or, it might skip half the elements you sent it.
The Solution:

Strict JSON Schemas: We used a technical "contract" called Zod. This forces the AI to return data in a very specific format. If the AI doesn't follow the format, the system catches it before it hits the UI.

Surgical Reinjection: Instead of trying to find the text again by name (which might change), we "tattoo" every element with a hidden ID (data-ai-id). When the AI sends back a change for node_42, our code knows exactly which element that is, even if the text is now completely different.



REFERENCE DOCS:https://ai.google.dev/gemini-api/docs