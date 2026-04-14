//1
import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const modificationSchema = z.object({
  id: z.string(),
  newText: z.string(),
  reasoning: z.string() 
});
const translationSchema = z.object({
  modifications: z.array(modificationSchema)
});

const adAnalysisSchema = z.object({
  offer: z.string(),
  urgency: z.string(),
  cta: z.string(),
  benefits: z.string(),
  tone: z.string()
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function fileToGenerativePart(base64Str: string, mimeType: string) {
  return {
    inlineData: {
      data: base64Str.split(',')[1] || base64Str, // Remove data:image/png;base64, prefix
      mimeType,
    },
  };
}

export async function POST(req: Request) {
  try {
    // ADDED: Destructure isImage from the request
    const { adCreative, landingPageUrl, isImage } = await req.json();

    const { data: html } = await axios.get(landingPageUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000 
    });
    
    const $ = cheerio.load(html);
    const origin = new URL(landingPageUrl).origin;

    // --- CLEANUP & IMAGE FIXES ---
    if ($('head').length > 0) $('head').prepend(`<base href="${origin}/">`);
    $('script, noscript, link[rel="preload"]').remove();
    $('[src], [srcset], [data-src]').each((_, el) => {
      const dataSrc = $(el).attr('data-src') || $(el).attr('data-lazy-src');
      if (dataSrc) $(el).attr('src', dataSrc);
      const src = $(el).attr('src');
      if (src && src.startsWith('/') && !src.startsWith('//')) $(el).attr('src', `${origin}${src}`);
      $(el).removeAttr('srcset');
    });

    // --- NODE EXTRACTION ---
    // --- GLOBAL TEXT EXTRACTION ---
const textNodes: { id: string, text: string, oldLength: number, tag: string }[] = [];
let counter = 0;

// 1. Target exactly what you want changed
$('h1, h2, h3, h4, p, a, button, span.btn-text, li').each((_, el) => {
  const $el = $(el);
  
  // 2. Get the text. trim() is key to ignore empty whitespace nodes
  const text = $el.text().trim();
  
  // 3. Only grab it if it has content and IS NOT a container for other big tags
  // We use .find() to see if there are nested headers/paragraphs inside
  const hasNestedBlock = $el.find('h1, h2, h3, h4, p').length > 0;

  if (text.length > 1 && !hasNestedBlock) {
    const id = `node_${counter++}`;
    const tag = el.tagName.toLowerCase(); 
    const oldLength = text.length;
    
    textNodes.push({ id, text, oldLength, tag });
    
    // Attach the ID directly to the element
    $el.attr('data-ai-id', id);
  }
});

    // --- STEP 1: ANALYZE AD CREATIVE (Updated for Image Support) ---
    let promptContents: any;

    if (isImage) {
      // Extract the mime type from the base64 string, default to jpeg
      const mimeType = adCreative.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
      const imagePart = fileToGenerativePart(adCreative, mimeType);
      
      // Multimodal prompt: Array with text and the image part
      promptContents = [
        "Analyze this Ad Creative image and extract its marketing DNA. Focus on the offer, urgency, cta, benefits, and tone shown in the visuals and text.",
        imagePart
      ];
    } else {
      // Standard text prompt
      promptContents = `Analyze this Ad Creative and extract its marketing DNA: "${adCreative}"`;
    }

    const analysisResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: promptContents,
      config: {
        systemInstruction: "You are a Marketing Strategist. Extract the DNA of this ad into JSON. Fields: offer, urgency, cta, benefits, tone.",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, 
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(adAnalysisSchema as any),
      },
    });

    const strategyJson = JSON.parse(analysisResponse.text || "{}");
    console.log("Ad DNA Extracted:", strategyJson);

    // --- STEP 2: REWRITE LANDING PAGE ---
    const rewriteResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        AD STRATEGY DNA:
        - Offer: ${strategyJson.offer}
        - Urgency: ${strategyJson.urgency}
        - Benefits: ${strategyJson.benefits}
        - Tone: ${strategyJson.tone}
        - Targeted CTA: ${strategyJson.cta}

        LANDING PAGE NODES:
        ${JSON.stringify(textNodes)}
        TASK :You MUST rewrite every node provided in the landing page using the ad creative and enhance rules
      `,
      config: {
        systemInstruction: `You are a CRO Expert. Enhance the text content of the landing page to better align with the ad's strategy while preserving the original meaning and brand voice. Use the provided nodes as targets for your rewrites. Follow these rules strictly:
    ENHANCE RULES:
    1. ALIGNMENT: Rewrites MUST reflect Brand Voice and incorporate Offer, Urgency, Benefits, and CTA from the Ad Strategy.
    2. CHARACTER LIMIT:  newText length must be within 10% of old_leng.
    3. HIERARCHY: 
       - H1/H2: Use these for the Main Offer, Brand messaging and Brand voice.
       
       - P (Paragraphs): Use these for "Benefits" and "Urgency".
       - A/BUTTON: Use these ONLY for the "CTA".
    4. VARIETY: Do not repeat the same phrase. If a node is a small link (e.g. "Learn More"), keep it as a short relevant link.
    5. RETURN: JSON modifications array with id, newText, and reasoning.`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseJsonSchema: zodToJsonSchema(translationSchema as any),
      },
    });

    // --- FIXED REINJECTION ---
const rawRewrite = rewriteResponse.text?.replace(/```json|```/g, "").trim();
const finalData = JSON.parse(rawRewrite || "{}");

let mods = Array.isArray(finalData) ? finalData : (finalData.modifications || []);

mods.forEach((mod: any) => {
  const incomingText = mod.newText || mod.text;
  if (mod.id && incomingText) {
    // Select any element that has our custom data attribute
    const $target = $(`[data-ai-id="${mod.id}"]`);
    
    if ($target.length > 0) {
      // Use .text() to replace content safely
      $target.text(incomingText.trim());
    }
  }
});


    $('[data-ai-id]').removeAttr('data-ai-id');

    return NextResponse.json({ 
      personalized: $.html() 
    });

  } catch (error: any) {
    console.error("Pipeline Error:", error);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}