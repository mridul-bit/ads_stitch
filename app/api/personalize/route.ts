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
  tone: z.string(),
  trust: z.string()
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

// 1. ADDED: Filter out nav, header, footer, and hidden elements
$('h1, h2, h3, h4, p, a, button, span.btn-text, li').each((_, el) => {
  const $el = $(el);
  
  // CHECK: Is this inside a nav or header?
  const isNav = $el.closest('nav, header, footer, .navbar, .menu').length > 0;
  if (isNav) return; // Skip these entirely

  const text = $el.text().trim();
  

  if (text.length > 1 ) {
    const id = `node_${counter++}`;
    const tag = el.tagName.toLowerCase(); 
    const oldLength = text.length;
    
    textNodes.push({ id, text, oldLength, tag });
    $el.attr('data-ai-id', id);
  }
});

    // --- STEP 1: ANALYZE AD CREATIVE (Updated for Image Support) ---
    let promptContents: any;

    if (isImage) {
     
      const mimeType = adCreative.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
      const imagePart = fileToGenerativePart(adCreative, mimeType);
      
     
      promptContents = [
        "Analyze this Ad Creative image and extract its marketing DNA. Focus on the offer, urgency, cta, benefits,  tone  and trust (social proof, guarantees, or certifications) shown in the visuals and text.",
        imagePart
      ];
    } else {
     
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
        - Trust: ${strategyJson.trust}
        - Targeted CTA: ${strategyJson.cta}

        LANDING PAGE NODES:
        ${JSON.stringify(textNodes)}
        TASK :You MUST rewrite every node provided in the landing page using the node's text, the ad creative and enhance rules
      `,
      config: {
        systemInstruction: `You are a CRO Expert. Enhance the text content of the landing page to better align with the ad's strategy while preserving the original meaning and brand voice. Use the provided nodes as targets for your rewrites. Follow these rules strictly:
    ENHANCE RULES:
    1. ALIGNMENT: Rewrites MUST reflect Brand Voice , Brand message incorporate Offer, Urgency, Benefits, and CTA from the Ad Strategy.
    2. STRICT CHARACTER LIMIT:  newText length must be fully within the old_leng.
    3. (Node data + ad creative) output GUIDELINES: 
       - H1: Use these for High-Impact Main Offer, Brand Tone, Brand messaging and Brand voice
       - H2/H3: Use these for "Urgency", "Trust",Brand Tone, Brand messaging, Brand voice 
       - Preserve the Brand Voice and Intent
       - P (Paragraphs): Use these for "Benefits", "Urgency" ,Trust/Guarantees", Brand tone ,Brand messaging, Brand voice 
       - A/BUTTON: Use these ONLY for the "CTA" (max 3-4 words)
   
    4. RETURN: JSON modifications array with id, newText, and reasoning.`,
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
    
    const $target = $(`[data-ai-id="${mod.id}"]`);
    
    if ($target.length > 0) {
    
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